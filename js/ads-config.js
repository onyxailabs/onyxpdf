/* =====================================================================
   OnyxPDF — Adsterra configuration.  *** THIS IS THE ONLY FILE TO EDIT ***
   ---------------------------------------------------------------------
   All values ship EMPTY: with empty values the site shows NO ads and
   NO empty boxes (js/ads.js is a complete no-op).

   HOW TO SWITCH ADS ON (owner, from your Adsterra dashboard):
   For each ad unit you create on adsterra.com you get a code snippet.
   Copy the script's "src" URL out of the snippet and paste it below:

   - bannerTopKey : a Banner unit (728x90 / responsive) — appears in the
                    slot below the header on the home view.
                    Snippet looks like:
                    <script src="//www.highperformanceformat.com/KEY/invoke.js"></script>
                    → paste just the URL: //www.highperformanceformat.com/KEY/invoke.js
   - nativeKey    : a Native Banner unit — appears in the slot in the
                    footer area.
   - socialBarKey : a Social Bar unit — site-wide, floats per Adsterra's
                    own design; no page slot needed.

   Paste the URL exactly as given (including the leading //), save this
   file, redeploy. Nothing else needs to change.
   ===================================================================== */
window.ADSTERRA = {
  bannerTopKey: 'https://www.highrevenueformat.com/783a47bd81920010340c3dea88eea71d/invoke.js',
  nativeKey: 'https://pl31959841.profitableratecpmnetwork.com/1e6ca535b790d4fdfa7c72325b111444/invoke.js',
  socialBarKey: 'https://pl31959842.profitableratecpmnetwork.com/6d/9c/fb/6d9cfb3ac5331995a30e29841c2bd81d.js'
};
