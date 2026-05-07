const CACHE = 'game-tracker-v3';
const ASSETS = [
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/version.js',
  './js/db.js',
  './js/reset.js',
  './js/image.js',
  './js/notifications.js',
  './js/screens/home.js',
  './js/screens/game.js',
  './js/screens/add-game.js',
  './js/screens/add-task.js',
  './js/screens/history.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

const notifTimers = new Map();

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});

self.addEventListener('message', (e) => {
  if (e.data?.type !== 'SCHEDULE_NOTIFICATIONS') return;

  // Clear old timers
  notifTimers.forEach(t => clearTimeout(t));
  notifTimers.clear();

  const { notifications } = e.data;
  const now = Date.now();

  for (const { id, title, body, timestamp } of notifications) {
    const delay = timestamp - now;
    if (delay > 0 && delay < 25 * 60 * 60 * 1000) {
      notifTimers.set(id, setTimeout(() => {
        self.registration.showNotification(title, {
          body,
          icon: './icons/icon-192.png',
          badge: './icons/icon-192.png',
          tag: id,
          renotify: true,
        });
      }, delay));
    }
  }
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      if (clients.length) return clients[0].focus();
      return self.clients.openWindow('./index.html');
    })
  );
});
