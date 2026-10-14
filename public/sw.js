/*
 * FitCoach Service Worker
 * - 页面导航：network-first，在线时缓存访问过的页面，离线时回退缓存页 / offline.html
 * - /mediapipe/ 模型与 WASM：cache-first（文件名固定、immutable，按需缓存，离线可识别）
 * - /_next/static/ 构建产物：stale-while-revalidate
 * - 图标/manifest：cache-first
 */
const VERSION = 'fitcoach-v1';
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const PRECACHE_URLS = ['/', '/offline.html'];

self.addEventListener('install', (event) => {
  // 仅预缓存，不自动 skipWaiting：
  // 首次安装由注册脚本发 SKIP_WAITING 立即激活；升级时停在 waiting，等用户在提示条里确认
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)));
});

// 页面发现 waiting 中的新版本后，可 postMessage({ type: 'SKIP_WAITING' }) 立即激活
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => ![STATIC_CACHE, RUNTIME_CACHE].includes(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === 'basic') cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok && res.type === 'basic') cache.put(request, res.clone());
      return res;
    })
    .catch(() => undefined);
  return hit || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 页面导航：network-first，离线回退
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        try {
          const fresh = await fetch(request);
          if (fresh.ok) cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cached = await cache.match(request);
          if (cached) return cached;
          const offline = await caches.match('/offline.html');
          return offline || Response.error();
        }
      })(),
    );
    return;
  }

  // 姿态模型 / WASM（immutable，按需 cache-first）
  if (url.pathname.startsWith('/mediapipe/')) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  // 图标 / manifest / favicon
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/favicon.ico'
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Next.js 构建产物
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  }
});
