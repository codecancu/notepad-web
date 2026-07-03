// SPDX-License-Identifier: GPL-3.0-or-later
//
// Service worker for the Notepad Web PWA (only registered when the app is
// served over http(s) — never in the chrome-extension:// build). Provides
// offline support (required for installability) via runtime caching: every
// successfully-fetched GET is cached, so after the first load the app works
// fully offline. This SW is unrelated to the MV3 background service worker.
const CACHE = 'notepad-web-v0.2.0';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        // Stale-while-revalidate: serve cache immediately if present, else network.
        return cached || network;
      }),
    ),
  );
});
