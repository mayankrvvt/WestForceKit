const CACHE_NAME = 'westforce-shell-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg'
];

function cacheResponse(request, response){
  if(!response.ok){
    return Promise.resolve(response);
  }

  return caches.open(CACHE_NAME)
    .then(cache => cache.put(request, response.clone()))
    .then(() => response)
    .catch(error => {
      console.error('WestForce could not cache a response.', error);
      return response;
    });
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('westforce-shell-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if(request.method !== 'GET'){
    return;
  }

  const url = new URL(request.url);

  if(url.origin !== self.location.origin){
    return;
  }

  if(request.mode === 'navigate'){
    event.respondWith(
      fetch(request)
        .then(response => cacheResponse(request, response))
        .catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request)
      .then(cached => cached || fetch(request).then(response => {
        return cacheResponse(request, response);
      }))
  );
});
