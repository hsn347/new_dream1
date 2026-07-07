const CACHE_VERSION = 'v3';
const STATIC_CACHE = `wakeel-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `wakeel-dynamic-${CACHE_VERSION}`;
const API_CACHE = `wakeel-api-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
  '/favicon.svg',
];

// API routes to cache offline (network-first + fallback)
const CACHEABLE_API = [
  '/api/user/dashboard',
  '/api/user/orders',
  '/api/user/products',
  '/api/user/analytics',
  '/api/user/conversations',
  '/api/user/coupons',
  '/api/user/customers',
  '/api/user/business',
  '/api/user/settings',
  '/api/user/notifications',
];

// ─── Install: pre-cache app shell ────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {});
    })
  );
  self.skipWaiting();
});

// ─── Activate: clean up old caches ───────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => ![STATIC_CACHE, DYNAMIC_CACHE, API_CACHE].includes(name))
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

const IS_DEV = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

// ─── Fetch: routing strategy ──────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Cache selected API calls: network-first, fallback to cached data
  if (event.request.method === 'GET' && url.pathname.startsWith('/api/')) {
    const isCacheable = CACHEABLE_API.some((p) => url.pathname.startsWith(p));
    if (!isCacheable) return; // bypass non-cacheable API calls

    event.respondWith(
      fetch(event.request.clone())
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request, { cacheName: API_CACHE });
          if (cached) return cached;
          return new Response(JSON.stringify({ offline: true, data: null }), {
            headers: { 'Content-Type': 'application/json', 'X-From-Cache': 'true' },
          });
        })
    );
    return;
  }

  // 2. In dev mode, always use network — never serve stale Vite bundles from cache
  if (IS_DEV) return;

  // 3. Navigation requests (page loads) — network first, fall back to cached shell
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          return caches.match('/index.html').then((cached) => cached || fetch(event.request));
        })
    );
    return;
  }

  // 4. Static assets (JS, CSS, fonts, images) — cache first, network fallback
  if (
    event.request.method === 'GET' &&
    (url.pathname.match(/\.(js|css|png|svg|jpg|jpeg|webp|woff2?|ttf|ico)$/) ||
      url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }
});

// ─── Push notifications ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); } catch { return; }

  const options = {
    body: data.body || '',
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    dir: 'rtl',
    lang: 'ar',
    tag: data.tag || 'wakeel-notification',
    renotify: true,
    data: { url: data.url || '/' },
    actions: data.url ? [{ action: 'open', title: 'فتح' }] : [],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'وكيل المبيعات', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ─── Background sync: send cached data when back online ──────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CLEAR_API_CACHE') {
    caches.delete(API_CACHE);
  }
});
