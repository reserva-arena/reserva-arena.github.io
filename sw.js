const CACHE_NAME = 'reserva-arena-v1781795080';

self.addEventListener('install', evt => {
  self.skipWaiting();
});

self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', evt => {
  // Network-first: sempre busca da rede, cache só como fallback
  evt.respondWith(
    fetch(evt.request).catch(() => caches.match(evt.request))
  );
});
