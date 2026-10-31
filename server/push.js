const webpush = require('web-push');
const { query } = require('./db');

const publicKey = process.env.VAPID_PUBLIC_KEY || '';
const privateKey = process.env.VAPID_PRIVATE_KEY || '';
const subject = process.env.VAPID_SUBJECT || '';

let configured = false;

if (publicKey && privateKey && subject) {
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (error) {
    console.error('Web Push configuration error:', error.message);
  }
}

function isValidEndpoint(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 4096) {
    return false;
  }

  try {
    const endpoint = new URL(value);
    return endpoint.protocol === 'https:' &&
      Boolean(endpoint.hostname) &&
      !endpoint.username &&
      !endpoint.password;
  } catch {
    return false;
  }
}

function isValidSubscription(subscription) {
  if (!subscription || typeof subscription !== 'object' || Array.isArray(subscription)) {
    return false;
  }

  const keys = subscription.keys;

  if (!isValidEndpoint(subscription.endpoint) || !keys ||
      typeof keys !== 'object' || Array.isArray(keys)) {
    return false;
  }

  return (
    typeof keys.p256dh === 'string' &&
    keys.p256dh.length >= 40 &&
    keys.p256dh.length <= 200 &&
    /^[A-Za-z0-9_-]+$/.test(keys.p256dh) &&
    typeof keys.auth === 'string' &&
    keys.auth.length >= 16 &&
    keys.auth.length <= 100 &&
    /^[A-Za-z0-9_-]+$/.test(keys.auth)
  );
}

function getPreferences(input = {}) {
  const preferences = input && typeof input === 'object' && !Array.isArray(input)
    ? input
    : {};

  return {
    posts: preferences.posts !== false,
    events: preferences.events !== false
  };
}

async function saveSubscription(subscription, preferences) {
  const cleanPreferences = getPreferences(preferences);

  await query(
    `INSERT INTO push_subscriptions
      (endpoint, subscription, preferences)
     VALUES ($1, $2::jsonb, $3::jsonb)
     ON CONFLICT (endpoint)
     DO UPDATE SET
       subscription = EXCLUDED.subscription,
       preferences = EXCLUDED.preferences,
       updated_at = NOW()`,
    [
      subscription.endpoint,
      JSON.stringify(subscription),
      JSON.stringify(cleanPreferences)
    ]
  );
}

async function removeSubscription(endpoint) {
  await query(
    'DELETE FROM push_subscriptions WHERE endpoint = $1',
    [endpoint]
  );
}

async function getSubscriptionPreferences(endpoint) {
  const result = await query(
    'SELECT preferences FROM push_subscriptions WHERE endpoint = $1 LIMIT 1',
    [endpoint]
  );

  return result.rowCount
    ? getPreferences(result.rows[0].preferences)
    : null;
}

async function notifySubscribers(kind, notification) {
  if (!configured || !['posts', 'events'].includes(kind)) {
    return { sent: 0, skipped: true };
  }

  const result = await query(
    `SELECT endpoint, subscription
     FROM push_subscriptions
     WHERE COALESCE((preferences->>$1)::boolean, true) = true`,
    [kind]
  );

  const safeUrl =
    typeof notification.url === 'string' &&
    notification.url.startsWith('/') &&
    !notification.url.startsWith('//')
      ? notification.url
      : '/';

  const payload = JSON.stringify({
    title: String(notification.title || 'NAICTS INFOHUB').slice(0, 100),
    body: String(notification.body || 'There is a new update.').slice(0, 180),
    url: safeUrl,
    tag: `naicts-${kind}`
  });

  let sent = 0;
  let failed = 0;

  const outcomes = await Promise.allSettled(
    result.rows.map(async row => {
      try {
        await webpush.sendNotification(
          row.subscription,
          payload,
          { TTL: 3600, urgency: 'normal' }
        );

        return true;
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await removeSubscription(row.endpoint);
        }

        throw error;
      }
    })
  );

  for (const outcome of outcomes) {
    if (outcome.status === 'fulfilled') sent++;
    else failed++;
  }

  if (failed) {
    console.error(`Push delivery: ${sent} sent, ${failed} failed.`);
  }

  return { sent, failed };
}

module.exports = {
  configured,
  publicKey,
  isValidEndpoint,
  isValidSubscription,
  saveSubscription,
  removeSubscription,
  getSubscriptionPreferences,
  notifySubscribers
};
