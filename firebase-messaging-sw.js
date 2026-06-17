importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDoimc11ZR1WzzW9uwWQ2Bj9Eyk46at-Ks",
  authDomain: "reserva-escolar-7add0.firebaseapp.com",
  projectId: "reserva-escolar-7add0",
  storageBucket: "reserva-escolar-7add0.firebasestorage.app",
  messagingSenderId: "775804714188",
  appId: "1:775804714188:web:e72408571e26ad00199669"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || 'Reserva Arena', {
    body: body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200]
  });
});

self.addEventListener('notificationclick', evt => {
  evt.notification.close();
  evt.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const url = 'https://reserva-arena.github.io/';
      for (const c of list) if (c.url.startsWith(url) && 'focus' in c) return c.focus();
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
