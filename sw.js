const CACHE_NAME = 'atlas-report-v6.4';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './firebase-config.js',
  './utils.js',
  './translations.js',
  './drive-service.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/signature_pad/4.1.7/signature_pad.umd.min.js',
  'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
  // Force the waiting service worker to become the active service worker.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Claim clients immediately so the new service worker takes control
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
