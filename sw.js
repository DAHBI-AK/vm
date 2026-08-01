const CACHE_NAME = 'vm-root-v1';
const ASSETS = [
  './',
  './manifest.json',
  './src/renderer/index.html',
  './src/renderer/styles.css',
  './src/renderer/app.js',
  './src/renderer/i18n.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request)).catch(() => fetch(e.request))
  );
});
