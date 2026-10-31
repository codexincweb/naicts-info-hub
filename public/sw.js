const VERSION = 'naicts-infohub-v2';
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const API_CACHE = `${VERSION}-public-api`;

const CORE_FILES = [
  '/',
  '/index.html',
  '/about.html',
  '/announcements.html',
  '/updates.html',
  '/events.html',
  '/gallery.html',
  '/pro.html',
  '/css/style.css',
  '/js/app.js',
  '/js/student-tools.js',
  '/js/scroll-reveal.js',
  '/assets/logo.svg',
  '/assets/naicts-logo.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache =>
      Promise.all(
        CORE_FILES.map(async file => {
          try {
            const response = await fetch(file, { cache: 'reload' });
            if (response.ok) await cache.put(file, response);
          } catch {
            // Continue if an individual asset is unavailable.
          }
        })
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key =>
            key.startsWith('naicts-infohub-') &&
            ![STATIC_CACHE, PAGE_CACHE, API_CACHE].includes(key)
          )
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function isPrivatePath(path) {
  return path === '/admin.html' ||
    path.startsWith('/admin') ||
    path.startsWith('/api/admin') ||
    path.startsWith('/api/auth');
}

function isPublicApi(path) {
  return path === '/api/public/posts' ||
    path === '/api/public/events' ||
    path === '/api/public/categories' ||
    path === '/api/public/gallery' ||
    /^\/api\/public\/posts\/[a-z0-9-]+$/i.test(path);
}

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (isPrivatePath(url.pathname)) return;
  if (url.pathname === '/sw.js') return;

  if (url.pathname.startsWith('/api/')) {
    if (!isPublicApi(url.pathname)) return;

    event.respondWith(
      fetch(request)
        .then(async response => {
          if (response.ok &&
              response.headers.get('content-type')?.includes('application/json')) {
            const cache = await caches.open(API_CACHE);
            await cache.put(request, response.clone());
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;

          return new Response(
            JSON.stringify({
              error: 'You are offline. This information has not been saved yet.'
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );

    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(async response => {
          if (response.ok) {
            const cache = await caches.open(PAGE_CACHE);
            await cache.put(request, response.clone());
          }
          return response;
        })
        .catch(async () => {
          return await caches.match(request) ||
            await caches.match(url.pathname) ||
            await caches.match('/index.html') ||
            new Response('You are offline. Please reconnect to access this page.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' }
            });
        })
    );

    return;
  }

  if (/\.(css|js|svg|png|jpe?g|webp|gif|woff2?)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;

        return fetch(request).then(async response => {
          if (response.ok) {
            const cache = await caches.open(STATIC_CACHE);
            await cache.put(request, response.clone());
          }
          return response;
        });
      })
    );
  }
});


// Display incoming NAICTS notifications.
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data = {};

    try {
      data = event.data ? event.data.json() : {};
    } catch {
      data = {};
    }

    const target = typeof data.url === 'string' &&
      data.url.startsWith('/') &&
      !data.url.startsWith('//')
        ? data.url
        : '/';

    await self.registration.showNotification(
      data.title || 'NAICTS INFOHUB',
      {
        body: data.body || 'There is a new update.',
        icon: '/assets/naicts-logo.jpg',
        badge: '/assets/naicts-logo.jpg',
        tag: data.tag || 'naicts-infohub',
        data: { url: target },
        renotify: false
      }
    );
  })());
});

// Open only same-origin destinations when a notification is tapped.
self.addEventListener('notificationclick', event => {
  event.notification.close();

  let targetUrl;

  try {
    const requestedUrl = event.notification.data?.url;
    targetUrl = new URL(
      typeof requestedUrl === 'string' ? requestedUrl : '/',
      self.location.origin
    );

    if (targetUrl.origin !== self.location.origin) {
      targetUrl = new URL('/', self.location.origin);
    }
  } catch {
    targetUrl = new URL('/', self.location.origin);
  }

  event.waitUntil((async () => {
    const windows = await clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of windows) {
      let clientOrigin = '';

      try {
        clientOrigin = new URL(client.url).origin;
      } catch {
        continue;
      }

      if (clientOrigin === self.location.origin && 'focus' in client) {
        if ('navigate' in client) {
          await client.navigate(targetUrl.href);
        }
        return client.focus();
      }
    }

    return clients.openWindow(targetUrl.href);
  })());
});
