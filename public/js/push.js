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

    const style = document.createElement('style');
    style.textContent = `
      .naicts-notification-button {
        position: fixed;
        z-index: 9998;
        right: 18px;
        bottom: 18px;
        width: 52px;
        height: 52px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 50%;
        color: #fff;
        background: #173f78;
        box-shadow: 0 5px 20px rgba(0,0,0,.22);
        cursor: pointer;
      }
      .naicts-notification-button svg {
        width: 24px;
        height: 24px;
      }
      .naicts-notification-panel {
        position: fixed;
        z-index: 9999;
        right: 18px;
        bottom: 82px;
        width: min(330px, calc(100vw - 36px));
        padding: 16px;
        color: #172033;
        background: #fff;
        border: 1px solid #dce3ed;
        border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0,0,0,.16);
        font: 14px/1.5 system-ui, sans-serif;
      }
      .naicts-notification-panel[hidden] {
        display: none !important;
      }
      .naicts-notification-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }
      .naicts-notification-header strong {
        font-size: 15px;
      }
      .naicts-notification-close {
        border: 0;
        background: transparent;
        color: #536174;
        font-size: 23px;
        cursor: pointer;
      }
      .naicts-notification-panel p {
        margin: 5px 0 12px;
      }
      .naicts-notification-panel label {
        display: flex;
        align-items: center;
        gap: 9px;
        margin: 12px 0;
        cursor: pointer;
      }
      .naicts-notification-panel input {
        width: 17px;
        height: 17px;
      }
      .naicts-notification-action {
        width: 100%;
        margin-top: 10px;
        padding: 11px 14px;
        border: 0;
        border-radius: 7px;
        color: #fff;
        background: #173f78;
        font-weight: 600;
        cursor: pointer;
      }
      .naicts-notification-action:disabled {
        opacity: .6;
        cursor: wait;
      }
      .naicts-notification-status {
        font-size: 12px;
        margin-bottom: 0 !important;
      }
    `;

    document.head.appendChild(style);

    const panel = document.createElement('section');
    panel.className = 'naicts-notification-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Manage notifications');

    panel.innerHTML = `
      <div class="naicts-notification-header">
        <strong>Manage notifications</strong>
        <button type="button"
          class="naicts-notification-close"
          aria-label="Close notification preferences">&times;</button>
      </div>

      <p>Choose which NAICTS updates you want to receive.</p>

      <label>
        <input type="checkbox" id="naicts-push-posts" checked>
        New announcements and posts
      </label>

      <label>
        <input type="checkbox" id="naicts-push-events" checked>
        Events and event updates
      </label>

      <button type="button" class="naicts-notification-action">
        Enable notifications
      </button>

      <p class="naicts-notification-status"
        role="status" aria-live="polite"></p>
    `;

    const manageButton = document.createElement('button');
    manageButton.type = 'button';
    manageButton.className = 'naicts-notification-button';
    manageButton.setAttribute('aria-label', 'Manage notifications');
    manageButton.setAttribute('aria-expanded', 'false');
    manageButton.title = 'Manage notifications';

    manageButton.innerHTML = `
      <svg viewBox="0 0 24 24"
        fill="none" stroke="currentColor"
        stroke-width="1.8" stroke-linecap="round"
        stroke-linejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>
        <path d="M10 21h4"/>
      </svg>
    `;

    document.body.appendChild(panel);
    document.body.appendChild(manageButton);

    const action = panel.querySelector('.naicts-notification-action');
    const closeButton = panel.querySelector('.naicts-notification-close');
    const status = panel.querySelector('.naicts-notification-status');
    const posts = panel.querySelector('#naicts-push-posts');
    const events = panel.querySelector('#naicts-push-events');

    const preferences = () => ({
      posts: posts.checked,
      events: events.checked
    });

    const setStatus = message => {
      status.textContent = message;
    };

    const openPanel = () => {
      panel.hidden = false;
      manageButton.setAttribute('aria-expanded', 'true');
    };

    const closePanel = () => {
      panel.hidden = true;
      manageButton.setAttribute('aria-expanded', 'false');
    };

    manageButton.addEventListener('click', () => {
      if (panel.hidden) openPanel();
      else closePanel();
    });

    closeButton.addEventListener('click', closePanel);

    let registration;
    let subscription;

    try {
      registration = await navigator.serviceWorker.ready;
      subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // An existing browser subscription means the panel
        // should stay hidden. Restore preferences from Neon.
        closePanel();
        action.textContent = 'Disable notifications';

        try {
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
        } catch (error) {
          console.error('Unable to synchronise notification preferences:', error);
          setStatus('Could not load saved preferences. Try again later.');
        }
      } else {
        // Only show the full panel when this device is not subscribed.
        openPanel();
      }
    } catch (error) {
      console.error('Notification setup error:', error);
      openPanel();
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

          const removed = await subscription.unsubscribe();

          if (!removed) {
            throw new Error('The browser could not disable this subscription.');
          }

          subscription = null;
          action.textContent = 'Enable notifications';
          setStatus('Notifications have been disabled on this device.');
          openPanel();
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
        setStatus('Notifications successfully enabled.');

        // Hide the panel after successful activation.
        closePanel();
      } catch (error) {
        setStatus(error.message);

        const current = await registration.pushManager.getSubscription()
          .catch(() => null);

        if (current) subscription = current;
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
      initialise().catch(error => console.error('Push setup failed:', error));
    });
  } else {
    initialise().catch(error => console.error('Push setup failed:', error));
  }
})();
