const CACHE_NAME = 'tideo-erp-v3';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/assets/tideo-isotipo.svg',
  '/assets/tideo-isotipo-white.svg',
  '/icons/tideo-icon-192.png',
  '/icons/tideo-icon-512.png',
  '/icons/tideo-maskable-192.png',
  '/icons/tideo-maskable-512.png',
];

const isLocalScope = () => (
  self.registration.scope.includes('localhost') ||
  self.registration.scope.includes('127.0.0.1')
);

const isSameOrigin = (request) => new URL(request.url).origin === self.location.origin;
const isNavigation = (request) => request.mode === 'navigate' || request.destination === 'document';
const isStaticAsset = (request) => (
  isSameOrigin(request) &&
  request.method === 'GET' &&
  ['script', 'style', 'image', 'font', 'manifest'].includes(request.destination)
);

self.addEventListener('install', event => {
  event.waitUntil(
    isLocalScope()
      ? caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
      : caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => (isLocalScope() ? self.registration.unregister() : undefined))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (isLocalScope() || request.method !== 'GET') return;

  if (isNavigation(request)) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  if (!isStaticAsset(request)) return;

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      });
      return cached || network;
    })
  );
});
