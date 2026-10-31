(() => {
  'use strict';

  const supported =
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  if (!supported) return;

  const encodeKey = value => {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  };

  const request = async (url, body) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'The request could not be completed.');
    }

    return data;
  };

  async function initialise() {
    const configResponse = await fetch('/api/public/push/config', {
      cache: 'no-store'
    });

    if (!configResponse.ok) return;

    const config = await configResponse.json();

    if (!config.enabled || !config.publicKey) return;

    const panel = document.createElement('details');
    panel.className = 'naicts-push-panel';

    panel.innerHTML = `
      <summary>Notification preferences</summary>
      <div class="naicts-push-content">
        <p>Choose which NAICTS updates you want to receive.</p>

        <label>
          <input type="checkbox" id="naicts-push-posts" checked>
          New announcements and posts
        </label>

        <label>
          <input type="checkbox" id="naicts-push-events" checked>
          Events and event updates
        </label>

        <button type="button" id="naicts-push-action">
          Enable notifications
        </button>

        <p id="naicts-push-status" role="status" aria-live="polite"></p>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .naicts-push-panel {
        position: fixed;
        z-index: 9998;
        right: 16px;
        bottom: 16px;
        width: min(330px, calc(100vw - 32px));
        color: #172033;
        background: #fff;
        border: 1px solid #dce3ed;
        border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0,0,0,.14);
        font: 14px/1.5 system-ui, sans-serif;
      }
      .naicts-push-panel summary {
        cursor: pointer;
        padding: 13px 16px;
        font-weight: 650;
      }
      .naicts-push-content {
        padding: 0 16px 15px;
      }
      .naicts-push-content p {
        margin: 5px 0 12px;
      }
      .naicts-push-content label {
        display: flex;
        gap: 9px;
        align-items: center;
        margin: 10px 0;
        cursor: pointer;
      }
      .naicts-push-content input {
        width: 17px;
        height: 17px;
      }
      .naicts-push-content button {
        width: 100%;
        margin-top: 9px;
        padding: 11px 14px;
        border: 0;
        border-radius: 7px;
        color: #fff;
        background: #173f78;
        font-weight: 600;
        cursor: pointer;
      }
      .naicts-push-content button:disabled {
        opacity: .6;
        cursor: wait;
      }
      #naicts-push-status {
        font-size: 12px;
        margin-bottom: 0;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(panel);

    const action = panel.querySelector('#naicts-push-action');
    const status = panel.querySelector('#naicts-push-status');
    const posts = panel.querySelector('#naicts-push-posts');
    const events = panel.querySelector('#naicts-push-events');

    const preferences = () => ({
      posts: posts.checked,
      events: events.checked
    });

    const setStatus = message => {
      status.textContent = message;
    };

    let registration;
    let subscription;

    try {
      registration = await navigator.serviceWorker.ready;
      subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const saved = await request('/api/public/push/preferences', {
          endpoint: subscription.endpoint
        });

        if (saved.subscribed && saved.preferences) {
          posts.checked = saved.preferences.posts !== false;
          events.checked = saved.preferences.events !== false;
        } else {
          await request('/api/public/push/subscribe', {
            subscription: subscription.toJSON(),
            preferences: preferences()
          });
        }

        action.textContent = 'Disable notifications';
        setStatus('Notifications are enabled on this device.');
      }
    } catch {
      setStatus('Notification setup is unavailable in this browser.');
      action.disabled = true;
      return;
    }

    action.addEventListener('click', async () => {
      action.disabled = true;

      try {
        if (subscription) {
          await request('/api/public/push/unsubscribe', {
            endpoint: subscription.endpoint
          });

          await subscription.unsubscribe();
          subscription = null;
          action.textContent = 'Enable notifications';
          setStatus('Notifications have been disabled on this device.');
          return;
        }

        if (Notification.permission === 'denied') {
          setStatus('Notifications are blocked. Allow them in your browser settings.');
          return;
        }

        if (Notification.permission !== 'granted') {
          const permission = await Notification.requestPermission();

          if (permission !== 'granted') {
            setStatus('Notification permission was not granted.');
            return;
          }
        }

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: encodeKey(config.publicKey)
        });

        await request('/api/public/push/subscribe', {
          subscription: subscription.toJSON(),
          preferences: preferences()
        });

        action.textContent = 'Disable notifications';
        setStatus('Notifications are enabled on this device.');
      } catch (error) {
        setStatus(error.message);

        if (subscription) {
          const saved = await registration.pushManager.getSubscription();
          if (saved) subscription = saved;
        }
      } finally {
        action.disabled = false;
      }
    });

    async function savePreferences() {
      if (!subscription) return;

      try {
        await request('/api/public/push/subscribe', {
          subscription: subscription.toJSON(),
          preferences: preferences()
        });

        setStatus('Your notification preferences have been saved.');
      } catch (error) {
        setStatus(error.message);
      }
    }

    posts.addEventListener('change', savePreferences);
    events.addEventListener('change', savePreferences);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initialise().catch(() => {});
    });
  } else {
    initialise().catch(() => {});
  }
})();
