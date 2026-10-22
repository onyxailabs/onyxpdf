# OnyxPDF — by Onyx AI Labs

**Every PDF tool. Zero uploads.** OnyxPDF is a complete PDF toolkit that runs
100% in the browser: files are never uploaded to any server, there is no
sign-up, no watermark, no daily task limit — and the scanner features
CamScanner charges $4.99/mo for are free here.

## Run it

It's plain static files — no build step.

```bash
# any static server works, e.g.:
python3 -m http.server 8137
# then open http://127.0.0.1:8137/
```

Or deploy the whole folder to GitHub Pages / Netlify / any static host as-is.
(Everything is vendored locally under `vendor/` — the app works fully offline
and makes zero third-party requests.)

## What's inside (31 tools, all verified end-to-end)

Merge · Split · Rotate · Organize pages · Flatten · PDF Info · Compress ·
Grayscale · PDF → Images · Images → PDF · Watermark · Page Numbers · Bates
Numbering · Header & Footer · Metadata Editor · Extract Text · PDF → Word ·
Word/Text → PDF · PDF → CSV · Compare PDFs · Fill Forms · Crop · Resize ·
N-up · Sign · Edit · Annotate & Highlight · Redact · Scan Enhance
(perspective correction + filters, the CamScanner replacement) · OCR
(English, Urdu, Arabic, Hindi, Spanish, French, German) · Protect (AES-256)
+ Unlock — real client-side encryption via qpdf-wasm.

## Customization

Dark / light themes + 4 accent colours, pin favourite tools to the top,
search, recent-file names (names only — never contents), and per-tool
settings — all persisted in `localStorage`, all on-device.

## Privacy architecture

There is no backend and no network call in any tool path. Documents exist
only as in-memory blobs in the user's tab. Libraries: pdf-lib, pdf.js,
Tesseract.js and qpdf — all vendored in this repo, loaded lazily per tool so
the shell stays small and fast.

## Docs

- `BUILD-REPORT.md` — build log, per-tool verification evidence, honest limitations, v2 roadmap.
- `COMPETITORS.md` — the competitor survey this product was built from (feature matrix, weaknesses, feasibility verdicts).
- `tests/` — headless verification suite (`make-fixtures.mjs`, `run-tests.mjs`): drives the real UI in Chrome and asserts on real outputs.
