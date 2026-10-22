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

  function fillSlot(id, url) {
    if (!url) return;
    var slot = document.getElementById(id);
    if (!slot) return;
    slot.hidden = false;
    slot.classList.add('ad-slot-on');
    loadScript(url, slot);
  }

  function init() {
    fillSlot('ad-slot-top', bannerTopKey);       // home view, below header
    fillSlot('ad-slot-footer', nativeKey);       // footer area
    if (socialBarKey) loadScript(socialBarKey, document.body); // site-wide
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
