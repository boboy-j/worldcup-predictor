/* 2026 World Cup Predictor - Service Worker */
const CACHE_NAME = 'wc2026-v1';
const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  './'
];

// 安装：预缓存静态资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // 个别文件缓存失败不影响安装
        console.log('[SW] Some assets already cached');
      });
    })
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// 请求拦截：缓存优先（静态资源）、网络优先（API）
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API 请求使用网络优先
  if (url.pathname.startsWith('/api/') || url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }

  // CDN 资源使用缓存优先
  if (url.hostname.includes('cdn.jsdelivr.net') || url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        }).catch(() => cached || new Response('Offline', { status: 503 }));
      })
    );
    return;
  }

  // 本站资源：网络优先，离线回退
  event.respondWith(
    fetch(event.request).then(response => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      return response;
    }).catch(() => {
      return caches.match(event.request).then(cached => {
        return cached || caches.match('./index.html');
      });
    })
  );
});
