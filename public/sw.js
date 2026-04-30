const CACHE_NAME = 'tideo-erp-prototype-v2';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/assets/tideo-isotipo.svg',
  '/assets/tideo-isotipo-white.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    self.registration.scope.includes('localhost') || self.registration.scope.includes('127.0.0.1')
      ? caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
      : caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME || self.registration.scope.includes('localhost') || self.registration.scope.includes('127.0.0.1')).map(key => caches.delete(key))
    )).then(() => (
      self.registration.scope.includes('localhost') || self.registration.scope.includes('127.0.0.1')
        ? self.registration.unregister()
        : undefined
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (self.registration.scope.includes('localhost') || self.registration.scope.includes('127.0.0.1')) return;
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => (
      cached || fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match('/index.html'))
    ))
  );
});
