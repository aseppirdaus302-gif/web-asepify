/*
 * Waveline Player — Service Worker
 * Strategy: Cache-First for static assets, Network-First for audio
 */

const CACHE_NAME    = 'waveline-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// ── Install: pre-cache shell assets ──────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching static shell');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: smart strategy per request type ───
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Audio files → Network-first, no caching (large files)
  // Audio streams through the browser's media pipeline anyway
  if (
    event.request.destination === 'audio' ||
    url.pathname.endsWith('.mp3') ||
    url.pathname.endsWith('.ogg') ||
    url.pathname.endsWith('.wav')
  ) {
    event.respondWith(fetch(event.request).catch(() => new Response('')));
    return;
  }

  // HTML pages → Network-first, fallback to cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Everything else → Cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Only cache valid same-origin responses
        if (
          !response ||
          response.status !== 200 ||
          response.type === 'opaque' ||
          !event.request.url.startsWith(self.location.origin)
        ) {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match('/index.html'));
    })
  );
});

// ── Background Sync (optional future use) ────
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});