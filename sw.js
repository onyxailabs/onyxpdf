/* OnyxPDF service worker — offline support for the installed PWA.
   All paths are RELATIVE to this file's location so the app works under
   any subpath (e.g. https://onyxailabs.github.io/onyxpdf/).
   Strategy:
   - App shell + core libs: precached at install, cache-first.
   - Heavy lazy engines (Tesseract cores/data, qpdf wasm): runtime-cached
     on first use, cache-first afterwards.
   Bump CACHE_VERSION on every deploy that changes cached files. */
'use strict';

const CACHE_VERSION = 'onyxpdf-v1';
const SHELL_CACHE = CACHE_VERSION + '-shell';
const RUNTIME_CACHE = CACHE_VERSION + '-runtime';

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/helpers.js',
  './js/tools-core.js',
  './js/tools-raster.js',
  './js/tools-stamp.js',
  './js/tools-text.js',
  './js/tools-interactive.js',
  './js/tools-place.js',
  './js/tools-scan.js',
  './js/tools-encrypt.js',
  './js/ads-config.js',
  './js/ads.js',
  './js/install.js',
  './vendor/pdf-lib.min.js',
  './vendor/pdf.min.js',
  './vendor/pdf.worker.min.js',
  './vendor/tesseract.min.js',
  './vendor/tesseract-worker.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

/* Heavy engines cached on first use (not precached — keeps install fast). */
const RUNTIME_PREFIXES = [
  'vendor/tess-core/',
  'vendor/tessdata/',
  'vendor/qpdf/'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin (ads etc.)

  // Page navigations: cache-first, fall back to network, then to the shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((hit) => hit || fetch(req))
    );
    return;
  }

  const path = url.pathname;
  const isRuntimeAsset = RUNTIME_PREFIXES.some((p) => path.includes('/' + p) || path.endsWith('/' + p.slice(0, -1)));

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const cacheName = isRuntimeAsset ? RUNTIME_CACHE : SHELL_CACHE;
          const copy = res.clone();
          caches.open(cacheName).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
