'use strict';

const CACHE_NAME = 'mln-v1';
const LOCAL_ASSETS = [
  '/mylittlenote/',
  '/mylittlenote/index.html',
  '/mylittlenote/style.css',
  '/mylittlenote/app.js',
  '/mylittlenote/manifest.json',
  '/mylittlenote/icon.svg',
  '/mylittlenote/icon-maskable.svg',
];

// Instalar: guardar assets locales en caché
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(LOCAL_ASSETS))
  );
  self.skipWaiting();
});

// Activar: limpiar cachés antiguas
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: caché primero para assets locales, red para el resto (Supabase, fuentes...)
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isLocal = url.origin === self.location.origin;

  if (isLocal) {
    // Assets propios: caché primero, red como fallback
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
  // Recursos externos (Supabase, Google Fonts...): dejar pasar sin interceptar
});
