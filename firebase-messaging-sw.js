// firebase-messaging-sw.js — Service Worker para FCM Push Notifications
// Reserva Arena — Colégio Arena

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyC_fN9rAp9pr_MsoHPuenVs2WF617cPKQg",
  authDomain:        "reserva-escolar-pcald5.firebaseapp.com",
  projectId:         "reserva-escolar-pcald5",
  storageBucket:     "reserva-escolar-pcald5.firebasestorage.app",
  messagingSenderId: "752088566449",
  appId:             "1:752088566449:web:77626857701992e3363090"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || 'Reserva Arena', {
    body: body || '',
    icon: icon || '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: payload.data || {}
  });
});

self.addEventListener('notificationclick', evt => {
  evt.notification.close();
  evt.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const appUrl = 'https://reserva-arena.github.io/';
      for (const client of list) {
        if (client.url.startsWith(appUrl) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(appUrl);
    })
  );
});
