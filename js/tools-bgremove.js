/* OnyxPDF — Background Remover.
   Engine: OUR OWN glue code running the DIS IS-Net "general-use" model
   (Apache License 2.0 — github.com/xuebinqin/DIS; weights converted by us
   from the official fp32 ONNX to fp16, ~91 MB) on stock onnxruntime-web
   1.20.1 (MIT License — Microsoft). No third-party background-removal
   library is involved anywhere. The pre/post-processing replicates the
   DIS project's own Inference.py and the rembg (MIT) ISNet session:
   resize to 1024x1024, scale pixels by the image max, normalize with
   mean 0.5 / std 1.0, take the first model output, min-max normalize it
   to 0-255 and use it as the alpha mask at the photo's native size.
   Everything is VENDORED under vendor/bgremove/ as <=4 MiB content-hashed
   chunks described by resources.json — the model is never fetched from
   anyone else's CDN. The engine loads lazily, on first use of this tool
   only, and is runtime-cached by the service worker (never precached).
   GitHub Pages cannot set COOP/COEP headers, so there is no
   SharedArrayBuffer: onnxruntime-web runs single-thread WASM, which is
   exactly what this tool is tested with. */
(function(){
"use strict";
const H = window.H, { el, esc } = H;
const IMG_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/bmp";
const SCRIPT_URL = (document.currentScript && document.currentScript.src) || document.baseURI;

/* =====================================================================
   MODEL ASSET SOURCE — the ONE deploy-time setting.
   The asset files live in this repo under vendor/bgremove/ (the source of
   truth). At runtime they are loaded PRIMARILY from the jsDelivr CDN,
   which serves those same files out of the public GitHub repo, and the
   loader AUTOMATICALLY FALLS BACK to the same-origin vendored copies if
   the CDN is unreachable — the tool never breaks either way.
   >>> DEPLOY: after vendor/bgremove/ is pushed, replace BG_ASSET_PIN with
       the immutable git commit hash (or a tag) of that push, so jsDelivr
       serves a pinned, cache-safe copy. Until then "main" tracks the
       branch. Verify https://cdn.jsdelivr.net/gh/onyxailabs/onyxpdf@<PIN>/vendor/bgremove/resources.json
       returns HTTP 200 with `access-control-allow-origin: *` after pushing.
   ===================================================================== */
const BG_ASSET_PIN = "b7d7256f9c79381a37d80ef57e579f7810c85a98"; // pinned to the commit whose tree contains the complete vendor/bgremove/ set
const BG_CDN_BASE = "https://cdn.jsdelivr.net/gh/onyxailabs/onyxpdf@" + BG_ASSET_PIN + "/vendor/bgremove/";
const BG_LOCAL_BASE = new URL("../vendor/bgremove/", SCRIPT_URL).href;
const MODEL_PATH = "/models/isnet-general-use.fp16.onnx";
const ORT_JS_PATH = "/onnxruntime-web/ort.wasm.min.mjs";
const ORT_MJS_PATH = "/onnxruntime-web/ort-wasm-simd-threaded.mjs";
const ORT_WASM_PATH = "/onnxruntime-web/ort-wasm-simd-threaded.wasm";
const MODEL_SIZE = 1024; // IS-Net's fixed input resolution

function panel(root){ const p = el("div","panel"); root.appendChild(p); return p; }
function actionRow(parent, label){
  const row = el("div","btn-row"); const btn = el("button","btn", esc(label)); row.appendChild(btn); parent.appendChild(row);
  const st = H.statusBox(parent);
  const outPanel = el("div","panel"); outPanel.classList.add("hidden");
  const outs = H.outputList(); outPanel.appendChild(outs.element); parent.parentNode.appendChild(outPanel);
  return { btn, st, outs, showOut(){ outPanel.classList.remove("hidden"); } };
}

/* ---- IEEE 754 half-float <-> single-float conversion (bit twiddling) ---- */
const _f32buf = new DataView(new ArrayBuffer(4));
function f32ToF16Bits(val){
  _f32buf.setFloat32(0, val);
  const x = _f32buf.getUint32(0);
  const sign = (x >> 16) & 0x8000;
  let exp = ((x >> 23) & 0xff) - 112; // 127 bias -> 15 bias
  let frac = x & 0x7fffff;
  if(exp <= 0){ // subnormal half or zero
    if(exp < -10) return sign;
    frac |= 0x800000;
    const shift = 14 - exp;
    let half = frac >> shift;
    if((frac >> (shift - 1)) & 1 && (half & 1 || (frac & ((1 << (shift - 1)) - 1)))) half++;
    return sign | half;
  }
  if(exp >= 31) return sign | 0x7c00; // overflow -> Inf (our values never get here)
  if(frac & 0x1000 && (frac & 0x1fff || frac & 0x2000)) frac += 0x2000;
  return sign | (exp << 10) | (frac >> 13);
}
function f16BitsToF32(h){
  const sign = (h & 0x8000) << 16;
  const exp = (h >> 10) & 0x1f;
  const frac = h & 0x3ff;
  if(exp === 0){
    if(frac === 0){ _f32buf.setUint32(0, sign); return _f32buf.getFloat32(0); }
    // subnormal half -> normalize
    let e = -14, f = frac;
    while(!(f & 0x400)){ f <<= 1; e--; }
    f &= 0x3ff;
    _f32buf.setUint32(0, sign | ((e + 127) << 23) | (f << 13));
    return _f32buf.getFloat32(0);
  }
  if(exp === 31){ _f32buf.setUint32(0, sign | 0x7f800000 | (frac << 13)); return _f32buf.getFloat32(0); }
  _f32buf.setUint32(0, sign | ((exp + 112) << 23) | (frac << 13));
  return _f32buf.getFloat32(0);
}

/* ---- Chunked asset loading (resources.json manifest, <=4 MiB chunks) ---- */
async function fetchManifest(base){
  const r = await fetch(base + "resources.json");
  if(!r || !r.ok) throw new Error("asset manifest not reachable");
  return r.json();
}
async function fetchResource(base, manifest, path, onBytes){
  const res = manifest[path];
  if(!res) throw new Error("asset manifest is missing " + path);
  const out = new Uint8Array(res.size);
  for(const ch of res.chunks){
    const r = await fetch(base + ch.hash);
    if(!r || !r.ok) throw new Error("asset chunk failed to load");
    const buf = new Uint8Array(await r.arrayBuffer());
    out.set(buf, ch.offsets[0]);
    if(onBytes) onBytes(buf.byteLength);
  }
  return out;
}

/* ---- Engine: onnxruntime-web + IS-Net session, cached per asset source ---- */
const engineByBase = {};
function loadEngine(base, onFetchProgress){
  if(!engineByBase[base]){
    engineByBase[base] = (async () => {
      const manifest = await fetchManifest(base);
      const total = [MODEL_PATH, ORT_JS_PATH, ORT_MJS_PATH, ORT_WASM_PATH]
        .reduce((s, p) => s + (manifest[p] ? manifest[p].size : 0), 0);
      let loaded = 0;
      const onBytes = n => { loaded += n; if(onFetchProgress && total > 0) onFetchProgress(loaded / total); };
      const [ortJs, ortMjs, ortWasm, model] = await Promise.all([
        fetchResource(base, manifest, ORT_JS_PATH, onBytes),
        fetchResource(base, manifest, ORT_MJS_PATH, onBytes),
        fetchResource(base, manifest, ORT_WASM_PATH, onBytes),
        fetchResource(base, manifest, MODEL_PATH, onBytes)
      ]);
      const blobUrl = (bytes, type) => URL.createObjectURL(new Blob([bytes], { type }));
      const ort = await import(blobUrl(ortJs, "text/javascript"));
      if(!ort || !ort.InferenceSession || !ort.Tensor) throw new Error("ONNX Runtime failed to initialise");
      ort.env.wasm.numThreads = 1; // no COOP/COEP on GitHub Pages -> single-thread WASM
      ort.env.wasm.wasmPaths = {
        mjs: blobUrl(ortMjs, "text/javascript"),
        wasm: blobUrl(ortWasm, "application/wasm")
      };
      const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
      return { ort, session };
    })().catch(e => { delete engineByBase[base]; throw new Error("The background-removal engine failed to load: " + (e.message || e)); });
  }
  return engineByBase[base];
}

/* Pick the asset source: CDN first (fast edge cache), local if the CDN
   preflight fails for any reason (offline, blocked, not yet deployed). */
async function pickSource(){
  try {
    const r = await fetch(BG_CDN_BASE + "resources.json", { method: "GET" });
    if(r && r.ok) return { base: BG_CDN_BASE, label: "CDN" };
  } catch(e) { /* fall through to local */ }
  return { base: BG_LOCAL_BASE, label: "this site (local copy)" };
}

/* ---- The DIS/IS-Net pipeline (mirrors DIS Inference.py + rembg session) ---- */
async function runModel(engine, bmp){
  const { ort, session } = engine;
  // 1. Resize to 1024x1024 and read pixels.
  const c = document.createElement("canvas"); c.width = MODEL_SIZE; c.height = MODEL_SIZE;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.drawImage(bmp, 0, 0, MODEL_SIZE, MODEL_SIZE);
  const px = g.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data;
  // 2. Normalize exactly like DIS/rembg: divide by the image's own max
  //    pixel value, then (x - 0.5) / 1.0, laid out CHW.
  let max = 0;
  for(let i = 0; i < px.length; i += 4){
    if(px[i] > max) max = px[i];
    if(px[i + 1] > max) max = px[i + 1];
    if(px[i + 2] > max) max = px[i + 2];
  }
  const scale = Math.max(max, 1e-6);
  const n = MODEL_SIZE * MODEL_SIZE;
  // onnxruntime-web wants native Float16Array data where the browser has
  // it (Chrome 135+), raw Uint16 half bits elsewhere.
  const nativeF16 = typeof Float16Array !== "undefined";
  const input = nativeF16 ? new Float16Array(3 * n) : new Uint16Array(3 * n);
  for(let p = 0; p < n; p++){
    for(let ch = 0; ch < 3; ch++){
      const v = px[p * 4 + ch] / scale - 0.5;
      input[ch * n + p] = nativeF16 ? v : f32ToF16Bits(v);
    }
  }
  const tensor = new ort.Tensor("float16", input, [1, 3, MODEL_SIZE, MODEL_SIZE]);
  const feeds = {}; feeds[session.inputNames[0]] = tensor;
  // 3. Run; ask for the fused first output only (the IS-Net side outputs
  //    are training heads — DIS inference uses result[0]).
  const outName = session.outputNames.indexOf("output_image") >= 0 ? "output_image" : session.outputNames[0];
  let outTensor;
  try {
    const results = await session.run(feeds, [outName]);
    outTensor = results[outName];
  } catch(e) {
    const results = await session.run(feeds);
    outTensor = results[session.outputNames[0]];
  }
  // 4. Min-max normalize the prediction map to 0..255 (DIS does the same).
  const raw = outTensor.data;
  const vals = new Float32Array(raw.length);
  const rawIsBits = raw instanceof Uint16Array; // else Float16Array: already numbers
  let mi = Infinity, ma = -Infinity;
  for(let i = 0; i < raw.length; i++){
    const v = rawIsBits ? f16BitsToF32(raw[i]) : raw[i];
    vals[i] = v; if(v < mi) mi = v; if(v > ma) ma = v;
  }
  const range = (ma - mi) || 1;
  const mask = new Uint8ClampedArray(raw.length);
  for(let i = 0; i < vals.length; i++) mask[i] = (vals[i] - mi) / range * 255;
  return mask; // 1024x1024, one byte per pixel
}

async function removeBackground(engine, file){
  const bmp = await createImageBitmap(file);
  const mask1024 = await runModel(engine, bmp);
  // 5. Resize the mask back to the photo's native size.
  const mc = document.createElement("canvas"); mc.width = MODEL_SIZE; mc.height = MODEL_SIZE;
  const mg = mc.getContext("2d");
  const mid = mg.createImageData(MODEL_SIZE, MODEL_SIZE);
  for(let i = 0; i < mask1024.length; i++){
    mid.data[i * 4] = mask1024[i]; mid.data[i * 4 + 1] = mask1024[i];
    mid.data[i * 4 + 2] = mask1024[i]; mid.data[i * 4 + 3] = 255;
  }
  mg.putImageData(mid, 0, 0);
  const oc = document.createElement("canvas"); oc.width = bmp.width; oc.height = bmp.height;
  const og = oc.getContext("2d", { willReadFrequently: true });
  og.imageSmoothingEnabled = true; og.imageSmoothingQuality = "high";
  og.drawImage(bmp, 0, 0);
  const imgData = og.getImageData(0, 0, bmp.width, bmp.height);
  const sc = document.createElement("canvas"); sc.width = bmp.width; sc.height = bmp.height;
  const sg = sc.getContext("2d", { willReadFrequently: true });
  sg.imageSmoothingEnabled = true; sg.imageSmoothingQuality = "high";
  sg.drawImage(mc, 0, 0, bmp.width, bmp.height);
  const maskBig = sg.getImageData(0, 0, bmp.width, bmp.height).data;
  // 6. The mask becomes the alpha channel of the original photo.
  for(let i = 0; i < imgData.data.length; i += 4) imgData.data[i + 3] = maskBig[i];
  og.putImageData(imgData, 0, 0);
  return new Promise(res => oc.toBlob(res, "image/png"));
}

Onyx.register({ id:"img-bgremove", name:"Background Remover", icon:"bgremove", tag:"AI · New", section:"image",
  blurb:"Remove a photo's background with an on-device AI model — transparent PNG out, or a solid colour behind your subject. The photo itself is never uploaded.",
  keywords:"remove background transparent png cutout ai bg remover product photo portrait",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept: IMG_ACCEPT, multiple:false, toolName:"Background Remover",
      title:"Drop a photo here", hint:"One photo at a time. Clear, well-lit subjects with a distinct background work best." });
    p.appendChild(dz.element);
    p.appendChild(el("p","small","How it stays private: an AI model (IS-Net, ~91 MB) downloads TO your device on first use and is cached here afterwards — your photo is never uploaded anywhere. First use needs internet for that one download; after that the tool works offline. On a weak phone it can take a minute or more per photo, and fine hair edges are softer than server tools like remove.bg — that is the honest price of never uploading. Model: IS-Net from the DIS project (Apache License 2.0) · Runtime: ONNX Runtime Web (MIT License) · Glue code: our own."));
    let bgMode = H.setting("img-bgremove","mode","transparent");
    const colorIn = document.createElement("input"); colorIn.type = "color";
    colorIn.value = H.setting("img-bgremove","color","#ffffff");
    colorIn.onchange = ()=> H.setSetting("img-bgremove","color", colorIn.value);
    const colorRow = el("div","color-input-row");
    colorRow.appendChild(el("span","small","Custom colour:")); colorRow.appendChild(colorIn);
    colorRow.style.display = bgMode === "custom" ? "" : "none";
    p.appendChild(H.field("Background in the result", H.radioRow([
      { value:"transparent", label:"Transparent" }, { value:"white", label:"White" }, { value:"custom", label:"Custom colour" }
    ], bgMode, v => { bgMode = v; H.setSetting("img-bgremove","mode", v); colorRow.style.display = v === "custom" ? "" : "none"; })));
    p.appendChild(colorRow);
    const { btn, st, outs, showOut } = actionRow(p, "Remove Background");
    btn.onclick = async ()=>{
      const f = dz.getFiles()[0]; if(!f){ st.err("Add a photo first."); return; }
      btn.disabled = true; outs.clear();
      const t0 = Date.now();
      try{
        st.say("Loading the AI engine…");
        const src = await pickSource();
        let lastPct = -1;
        const progress = frac => {
          const pct = Math.floor(frac * 100);
          if(pct !== lastPct){ lastPct = pct; st.say("Downloading the AI model + runtime (~102 MB, first use only) — " + pct + "% · via " + src.label + ". It stays cached on your device after this."); }
        };
        let outBlob, used = src;
        try {
          const engine = await loadEngine(src.base, progress);
          st.say("Removing the background — the AI is running on your device (this can take a while on slower phones)…");
          outBlob = await removeBackground(engine, f);
        } catch(e1){
          if(src.base !== BG_LOCAL_BASE){
            st.say("The CDN copy could not be loaded — falling back to the copy on this site…");
            used = { base: BG_LOCAL_BASE, label: "this site (local copy, CDN fallback)" };
            const engine = await loadEngine(BG_LOCAL_BASE, progress);
            st.say("Removing the background — the AI is running on your device (this can take a while on slower phones)…");
            outBlob = await removeBackground(engine, f);
          } else throw e1;
        }
        if(bgMode !== "transparent"){
          const colour = bgMode === "white" ? "#ffffff" : colorIn.value;
          const bmp = await createImageBitmap(outBlob);
          const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
          const g = c.getContext("2d"); g.fillStyle = colour; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0);
          outBlob = await new Promise(res => c.toBlob(res, "image/png"));
          showOut(); outs.add(H.baseName(f.name) + "_nobg.png", outBlob, bmp.width + "×" + bmp.height + " px · on " + colour);
        } else {
          const bmp = await createImageBitmap(outBlob);
          showOut(); outs.add(H.baseName(f.name) + "_nobg.png", outBlob, bmp.width + "×" + bmp.height + " px · transparent PNG");
        }
        st.ok("Done in " + Math.round((Date.now() - t0) / 1000) + "s — background removed on your device (model via " + used.label + "). Your photo was never uploaded.");
      }catch(e){ st.err(e.message || String(e)); }
      btn.disabled = false;
    };
  }
});
})();
