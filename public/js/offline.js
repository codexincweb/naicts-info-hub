(() => {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .catch(error => console.error('Offline support registration failed:', error));
    });
  }

  function updateConnectionStatus() {
    let notice = document.getElementById('naicts-offline-notice');

    if (!navigator.onLine) {
      if (!notice) {
        notice = document.createElement('div');
        notice.id = 'naicts-offline-notice';
        notice.textContent = 'You are offline. Showing previously saved information.';
        notice.setAttribute('role', 'status');

        Object.assign(notice.style, {
          position: 'fixed',
          top: '0',
          left: '0',
          right: '0',
          zIndex: '99999',
          padding: '12px',
          background: '#26364a',
          color: '#fff',
          textAlign: 'center',
          fontSize: '13px',
          fontWeight: '600'
        });

        document.body.appendChild(notice);
      }
    } else if (notice) {
      notice.remove();
    }
  }

  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateConnectionStatus);
  } else {
    updateConnectionStatus();
  }
})();
