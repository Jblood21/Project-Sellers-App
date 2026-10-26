/* Minimal offline shell so "Add to Home Screen" behaves like an app.
   App shell is cached; API traffic always goes to the network. */
// Bumped whenever what the worker stores changes shape, so a browser holding the
// old store (v1 froze the lender and Equal Housing artwork) drops it on activate.
const CACHE = 'psa-shell-v2';
const SHELL = ['/', '/icon-512.svg', '/favicon.svg'];
// Static files whose name does not change when their content does.
const UNHASHED = /^\/(brand|guides)\//;
// The pages server/lib/ssr.js writes a head into: /c/:id, /c/:id/guides, /c/:id/guides/:slug.
const SERVER_RENDERED = /^\/c\/[^/]+(\/guides(\/[^/]+)?)?\/?$/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// A page sends this when it is holding something it may have to send as it closes (see client/src/admin/homes/
// removals.jsx). The browser stops an idle worker, and starting one takes longer than a closing page leaves, so
// the message is what has the worker running by the time that request arrives. It needs no answer.
self.addEventListener('message', () => {});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // A request sent with keepalive is one the page sent as it was being closed or left (a photo whose removal was
  // waiting out its Undo time). Left to the page, a browser drops it when a service worker controls that page, so
  // the worker sends it itself: it lives on after the page is gone, and the answer has nobody left to read it.
  if (request.keepalive && url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: network first so a deploy is picked up, cache as the offline fallback.
  // The fallback is one neutral shell under '/', so only a plain successful page
  // may replace it. The three public pages (a community's landing page, the guide
  // list and a guide) come back with that community's own title, canonical and
  // structured data written in, and an error response is JSON; either, stored
  // under '/', would be what a buyer sees offline for every other address.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && !SERVER_RENDERED.test(url.pathname)) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // The compliance artwork (/brand) and the guide pictures (/guides) are not
  // content-hashed, so a cache-first copy would freeze the old file in every
  // installed app until site data is cleared, and a corrected lender logo or
  // Equal Housing mark has to reach buyers. They go network first and fall back
  // to the copy only offline. Hashed /assets files never change under their name,
  // so those stay cache first.
  if (UNHASHED.test(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
