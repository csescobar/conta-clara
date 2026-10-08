const BUILD_ID = '__PWA_BUILD_ID__';
const CACHE_PREFIX = 'conta-clara-shell-';
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`;
const PRECACHE_URLS = __PWA_PRECACHE_URLS__;
const APP_ORIGIN = self.location.origin;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== APP_ORIGIN || url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const shell = await caches.match('/');
        return shell ?? new Response('A interface offline ainda não está disponível.', { status: 503 });
      }),
    );
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest';
  if (!isStaticAsset) return;

  event.respondWith(
    (async () => {
      // Hashed same-origin assets are immutable for this build; Vary: Origin
      // must not make the precached copy miss after an offline navigation.
      const cached = await caches.match(request, { ignoreVary: true });
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
