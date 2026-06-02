const CACHE_NAME = 'finfolio-v3';
const ASSETS = [
  '/favicon.svg',
  '/icons.svg',
  '/manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // Let API requests bypass PWA cache completely
  if (url.includes('/api/')) {
    return;
  }

  // Network-First for main page / navigate requests to prevent caching outdated chunk hashes
  const isNavigate = e.request.mode === 'navigate' || 
                   (e.request.headers.get('accept') && e.request.headers.get('accept').includes('text/html'));
                   
  if (isNavigate) {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          if (response.status === 200) {
            const responseCopy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, responseCopy);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(e.request);
        })
    );
    return;
  }

  // Cache-First with background fetch update (Stale-While-Revalidate) for other static files
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      const networkFetch = fetch(e.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseCopy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, responseCopy);
            });
          }
          return response;
        })
        .catch(() => {
          // Fetch fails when offline
        });

      return cachedResponse || networkFetch;
    })
  );
});
