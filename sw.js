const CACHE_NAME = 'reserva-arena-v1781795073';
const ASSETS = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap'
];

self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(['/','index.html']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', evt => {
  // Sempre busca da rede para o Firebase (dados em tempo real)
  if (evt.request.url.includes('firebase') || 
      evt.request.url.includes('firestore') ||
      evt.request.url.includes('googleapis.com/firestore')) {
    return;
  }
  evt.respondWith(
    fetch(evt.request)
      .then(resp => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(evt.request, clone));
        return resp;
      })
      .catch(() => caches.match(evt.request))
  );
});
