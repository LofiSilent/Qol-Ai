// Кеш сайта: повторные открытия (и показ без интернета) берут модель и скрипты локально.
// HTML — сначала сеть (новые версии подхватываются сразу), остальное — из кеша текущей сборки.
const CACHE = 'qol-__BUILD__';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // по одному файлу: сбой одного не отменяет установку
    await Promise.all(PRECACHE.map(url => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('qol-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== location.origin || url.pathname.includes('/assets/video/')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        if (fresh.ok) (await caches.open(CACHE)).put('index.html', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match('index.html')) || Response.error();
      }
    })());
    return;
  }
  if (url.pathname.includes('/vendor/mediapipe/') || url.pathname.includes('/assets/models/')) {
    // тяжёлые файлы камеры (~17 МБ): кладём в кеш при первом использовании, дальше работают без сети
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
      return response;
    })());
    return;
  }
  event.respondWith((async () => {
    const exact = await caches.match(request);
    if (exact) return exact;
    // файлы без ?v= (шрифты, иконки, модель с хэшем в имени) можно брать без учёта строки запроса
    if (!url.searchParams.has('v')) { const loose = await caches.match(request, { ignoreSearch: true }); if (loose) return loose; }
    return fetch(request);
  })());
});
