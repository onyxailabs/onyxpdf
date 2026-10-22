/* OnyxPDF — Adsterra loader.
   Reads window.ADSTERRA (js/ads-config.js). While every key is empty this
   file is a graceful no-op: nothing is injected, the ad slots stay
   collapsed (hidden, zero height — no layout shift), no console errors.
   When a key (an Adsterra script URL) is pasted into ads-config.js, the
   matching slot is un-collapsed and the script is injected into it. */
(function () {
  'use strict';

  var cfg = window.ADSTERRA || {};
  var bannerTopKey = (cfg.bannerTopKey || '').trim();
  var nativeKey = (cfg.nativeKey || '').trim();
  var socialBarKey = (cfg.socialBarKey || '').trim();

  if (!bannerTopKey && !nativeKey && !socialBarKey) return; // ads off

  function loadScript(url, container) {
    if (!url) return;
    var s = document.createElement('script');
    s.async = true;
    s.src = url;
    (container || document.body).appendChild(s);
  }

  // Adsterra unit key = the path segment right before /invoke.js
  function keyFromUrl(url) {
    var parts = (url || '').split('/').filter(Boolean);
    var i = parts.indexOf('invoke.js');
    return i > 0 ? parts[i - 1] : '';
  }

  function fillSlot(id, url) {
    if (!url) return;
    var slot = document.getElementById(id);
    if (!slot) return;
    slot.hidden = false;
    slot.classList.add('ad-slot-on');
    loadScript(url, slot);
  }

  function fillBanner(url) {
    // HighRevenueFormat banner units read window.atOptions (key + size)
    // BEFORE invoke.js runs — the dashboard snippet defines it inline.
    var key = keyFromUrl(url);
    if (key) {
      window.atOptions = {
        key: key,
        format: 'iframe',
        height: 90,
        width: 728,
        params: {}
      };
    }
    fillSlot('ad-slot-top', url);
  }

  function fillNative(url) {
    // Native Banner units render into <div id="container-KEY"> and their
    // snippet carries data-cfasync="false" — create both faithfully.
    var slot = document.getElementById('ad-slot-footer');
    if (!slot || !url) return;
    slot.hidden = false;
    slot.classList.add('ad-slot-on');
    var key = keyFromUrl(url);
    var holder = document.createElement('div');
    if (key) holder.id = 'container-' + key;
    slot.appendChild(holder);
    var s = document.createElement('script');
    s.async = true;
    s.setAttribute('data-cfasync', 'false');
    s.src = url;
    slot.appendChild(s);
  }

  function init() {
    if (bannerTopKey) fillBanner(bannerTopKey);  // home view, below header
    if (nativeKey) fillNative(nativeKey);        // footer area
    if (socialBarKey) loadScript(socialBarKey, document.body); // site-wide
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
