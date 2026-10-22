/* OnyxPDF — PWA service-worker registration + install affordance.
   The install bar stays hidden unless:
   - Chromium fires `beforeinstallprompt` (real install available), or
   - the visitor is on iOS Safari (no prompt API — show the Share hint).
   Dismissal is remembered in localStorage. Once installed, never shown. */
(function () {
  'use strict';

  /* --- service worker: resolve sw.js from THIS script's URL, not the page's,
     so registration also works on static tool pages (/merge-pdf/ etc.) --- */
  if ('serviceWorker' in navigator) {
    var swUrl = 'sw.js';
    try {
      if (document.currentScript && document.currentScript.src) {
        swUrl = document.currentScript.src.replace(/js\/install\.js(\?.*)?$/, 'sw.js');
      }
    } catch (e) { /* fall back to the page-relative path */ }
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(swUrl).catch(function () { /* offline support is a bonus, never break the app */ });
    });
  }

  var DISMISS_KEY = 'onyxpdf-install-dismissed';
  var bar = document.getElementById('install-bar');
  if (!bar) return;
  var btnInstall = document.getElementById('btn-install-app');
  var btnDismiss = document.getElementById('btn-install-dismiss');
  var hint = document.getElementById('install-hint');
  var deferredPrompt = null;

  function dismissed() {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; }
  }
  function remember() {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) { /* private mode */ }
  }
  function standalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function show() { if (!dismissed() && !standalone()) bar.hidden = false; }
  function hide() { bar.hidden = true; }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (btnInstall) btnInstall.hidden = false;
    if (hint) hint.textContent = 'Install OnyxPDF for one-tap access — works offline, no uploads.';
    show();
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    hide();
    remember();
  });

  if (btnInstall) {
    btnInstall.addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () { deferredPrompt = null; hide(); });
    });
  }
  if (btnDismiss) {
    btnDismiss.addEventListener('click', function () { remember(); hide(); });
  }

  /* iOS Safari: no beforeinstallprompt — show the manual hint instead. */
  var ua = window.navigator.userAgent || '';
  var isIOS = /iphone|ipad|ipod/i.test(ua) && !window.MSStream;
  var isSafari = /safari/i.test(ua) && !/crios|fxios|chrome/i.test(ua);
  if (isIOS && isSafari && !standalone()) {
    if (btnInstall) btnInstall.hidden = true;
    if (hint) hint.textContent = 'Install OnyxPDF: tap Share, then “Add to Home Screen”.';
    show();
  }
})();
