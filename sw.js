const CACHE_NAME = 'vm-pwa-v31';
const OFFLINE_URL = './offline.html';
const ASSETS_TO_CACHE = [
  './offline.html',
  './manifest.json',
  './assets/icon.png',
  './assets/vm-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  if (event.request.method !== 'GET') {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL) || caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    fetch(event.request).then((networkResponse) => {
      return networkResponse;
    }).catch(() => caches.match(event.request).then((cached) => {
      if (cached) return cached;
      if (event.request.headers.get('accept')?.includes('text/html')) {
        return caches.match(OFFLINE_URL);
      }
      return undefined;
    }))
  );
});
