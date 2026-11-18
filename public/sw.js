// Get the current page when online, and reuse downloaded assets to keep start-up quick and work offline.
const CACHE = 'waqu-v6';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('waqu-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('/sw.js')) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const key = new Request(url.origin + url.pathname);
      const hit = await cache.match(key);
      const page = req.mode === 'navigate';
      const fresh = (page ? fetch(req, { cache: 'no-cache' }) : fetch(req))
        .then((res) => {
          if (res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => hit ?? Response.error());
      if (hit && !page) {
        e.waitUntil(fresh.catch(() => undefined));
        return hit;
      }
      return fresh;
    }),
  );
});
