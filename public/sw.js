// Keeps everything the game has downloaded on the device, so a second visit (or a flaky connection) doesn't
// have to fetch it again. Stale-while-revalidate: answer from the cache at once, refresh it in the background.
// A new deploy therefore shows up on the visit after the one that noticed it.
const CACHE = 'waqu-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
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
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => hit ?? Response.error());
      if (hit) {
        e.waitUntil(fresh.catch(() => undefined));
        return hit;
      }
      return fresh;
    }),
  );
});
