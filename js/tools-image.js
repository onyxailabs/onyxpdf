/* OnyxPDF — image tools I: Compress, Resize, Convert, Crop, Rotate, Watermark,
   Editor, Text/Meme, Passport, HEIC. All canvas-based, 100% on-device. */
(function(){
"use strict";
const H = window.H, { el, esc } = H;

function panel(root){ const p = el("div","panel"); root.appendChild(p); return p; }
function actionRow(parent, label){
  const row = el("div","btn-row"); const btn = el("button","btn", esc(label)); row.appendChild(btn); parent.appendChild(row);
  const st = H.statusBox(parent);
  const outPanel = el("div","panel"); outPanel.classList.add("hidden");
  const outs = H.outputList(); outPanel.appendChild(outs.element); parent.parentNode.appendChild(outPanel);
  return { btn, st, outs, showOut(){ outPanel.classList.remove("hidden"); } };
}
const IMG_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/bmp,.heic,.heif";

/* ---------- shared image primitives (also used by tools-image2.js) ---------- */
async function loadImg(file){
  try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch(e){ return await createImageBitmap(file); }
}
function mkCanvas(w, h){ const c = el("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
function drawTo(bmp, w, h){ const c = mkCanvas(w, h); c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); return c; }
function encode(canvas, type, q){ return new Promise(res=> canvas.toBlob(b=> res(b), type, q)); }
function extOf(name){ const m = /\.([a-z0-9]+)$/i.exec(name||""); return m? m[1].toLowerCase() : ""; }
function mimeOf(file){ if(file.type) return file.type; const e = extOf(file.name); return e==="jpg"? "image/jpeg" : e? "image/"+e : ""; }
/* 24-bit BMP encoder (canvas has no BMP encoder) */
function canvasToBmpBytes(canvas){
  const w = canvas.width, h = canvas.height;
  const g = canvas.getContext("2d"); const data = g.getImageData(0, 0, w, h).data;
  const rowSize = Math.floor((24 * w + 31) / 32) * 4;
  const imgSize = rowSize * h, fileSize = 54 + imgSize;
  const buf = new ArrayBuffer(fileSize); const dv = new DataView(buf); const u8 = new Uint8Array(buf);
  dv.setUint16(0, 0x424D, false); dv.setUint32(2, fileSize, true); dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true); dv.setInt32(18, w, true); dv.setInt32(22, -h, true);
  dv.setUint16(26, 1, true); dv.setUint16(28, 24, true); dv.setUint32(34, imgSize, true);
  for(let y = 0; y < h; y++){
    let off = 54 + y * rowSize;
    for(let x = 0; x < w; x++){
      const i = (y * w + x) * 4; const a = data[i + 3] / 255;
      u8[off++] = Math.round(data[i + 2] * a + 255 * (1 - a));
      u8[off++] = Math.round(data[i + 1] * a + 255 * (1 - a));
      u8[off++] = Math.round(data[i] * a + 255 * (1 - a));
    }
  }
  return new Uint8Array(buf);
}
async function encodeAs(canvas, fmt, q, bg){
  if(fmt === "bmp") return new Blob([canvasToBmpBytes(canvas)], { type: "image/bmp" });
  let use = canvas;
  if((fmt === "jpg") && bg){
    use = mkCanvas(canvas.width, canvas.height); const g = use.getContext("2d");
    g.fillStyle = bg; g.fillRect(0, 0, use.width, use.height); g.drawImage(canvas, 0, 0);
  }
  return encode(use, fmt === "jpg"? "image/jpeg" : fmt === "webp"? "image/webp" : "image/png", q);
}
/* ---- palette-quantized PNG (the TinyPNG trick) ----
   Canvas PNG export is always truecolour, which barely shrinks noisy images.
   So: median-cut quantize to N colours, then write a real palette PNG
   (colour type 3) with our own encoder + CompressionStream deflate.       */
const CRC_TABLE = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(bytes){ let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function pngChunk(type, data){
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8); dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
async function deflateBytes(bytes){
  const cs = new CompressionStream("deflate");
  const reader = cs.readable.getReader(), parts = [];
  const pump = (async () => { for (;;){ const r = await reader.read(); if (r.done) break; parts.push(r.value); } })();
  const writer = cs.writable.getWriter(); await writer.write(bytes); await writer.close(); await pump;
  let n = 0; parts.forEach(p => n += p.length);
  const out = new Uint8Array(n); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; });
  return out;
}
async function palettePngBytes(canvas, maxColors){
  if (typeof CompressionStream === "undefined") return null;
  const w = canvas.width, h = canvas.height;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  const px = g.getImageData(0, 0, w, h).data, total = w * h;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 250) return null;   /* transparency → truecolour fallback */
  const stride = Math.max(1, Math.floor(total / 100000)), samples = [];
  for (let i = 0; i < total; i += stride){ const j = i * 4; samples.push([px[j], px[j + 1], px[j + 2]]); }
  if (!samples.length) return null;
  let boxes = [samples];
  const boxRange = b => { let r0 = 255, r1 = 0, g0 = 255, g1 = 0, b0 = 255, b1 = 0; for (const p of b){ if (p[0] < r0) r0 = p[0]; if (p[0] > r1) r1 = p[0]; if (p[1] < g0) g0 = p[1]; if (p[1] > g1) g1 = p[1]; if (p[2] < b0) b0 = p[2]; if (p[2] > b1) b1 = p[2]; } return [r1 - r0, g1 - g0, b1 - b0]; };
  while (boxes.length < maxColors){
    let bi = -1, bScore = 0, bCh = 0;
    boxes.forEach((b, i) => { if (b.length < 2) return; const r = boxRange(b), m = Math.max(r[0], r[1], r[2]), s = m * b.length; if (s > bScore){ bScore = s; bi = i; bCh = r.indexOf(m); } });
    if (bi < 0) break;
    const box = boxes.splice(bi, 1)[0].sort((a, b) => a[bCh] - b[bCh]), mid = box.length >> 1;
    boxes.push(box.slice(0, mid), box.slice(mid));
  }
  const palette = boxes.map(b => { let r = 0, gg = 0, bl = 0; b.forEach(p => { r += p[0]; gg += p[1]; bl += p[2]; }); return [Math.round(r / b.length), Math.round(gg / b.length), Math.round(bl / b.length)]; });
  const cache = new Int16Array(32768).fill(-1), idx = new Uint8Array(total);
  for (let i = 0; i < total; i++){
    const j = i * 4, qr = px[j] >> 3, qg = px[j + 1] >> 3, qb = px[j + 2] >> 3, key = (qr << 10) | (qg << 5) | qb;
    let v = cache[key];
    if (v < 0){ const r = qr * 8 + 4, gg = qg * 8 + 4, bb = qb * 8 + 4; let bd = Infinity; v = 0; for (let k = 0; k < palette.length; k++){ const dr = r - palette[k][0], dg = gg - palette[k][1], db = bb - palette[k][2], d = dr * dr + dg * dg + db * db; if (d < bd){ bd = d; v = k; } } cache[key] = v; }
    idx[i] = v;
  }
  const raw = new Uint8Array(h * (1 + w));
  for (let y = 0; y < h; y++){ const ro = y * (1 + w); raw[ro] = 1; for (let x = 0; x < w; x++) raw[ro + 1 + x] = (idx[y * w + x] - (x ? idx[y * w + x - 1] : 0)) & 255; }   /* Sub filter */
  const comp = await deflateBytes(raw);
  const ihdr = new Uint8Array(13), idv = new DataView(ihdr.buffer);
  idv.setUint32(0, w); idv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 3;
  const plte = new Uint8Array(palette.length * 3); palette.forEach((c, i) => { plte[i * 3] = c[0]; plte[i * 3 + 1] = c[1]; plte[i * 3 + 2] = c[2]; });
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", ihdr), pngChunk("PLTE", plte), pngChunk("IDAT", comp), pngChunk("IEND", new Uint8Array(0))];
  let n = 0; parts.forEach(p => n += p.length);
  const out = new Uint8Array(n); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; });
  return out;
}
window.ImgH = { loadImg, mkCanvas, drawTo, encode, encodeAs, extOf, mimeOf, palettePngBytes, canvasToBmpBytes, dragStage, fitStage };

/* ================= COMPRESS IMAGE ================= */
Onyx.register({ id:"img-compress", name:"Compress Image", icon:"imgcompress", tag:"Popular", section:"image",
  blurb:"Shrink JPG, PNG and WebP photos in batches — or hit an exact form limit with Compress to KB (20 / 50 / 100 KB…).",
  keywords:"compress image reduce kb jpg png webp tinypng squoosh shrink photo size form",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept: IMG_ACCEPT, multiple: true, toolName:"Compress Image", title:"Drop images here",
      hint:"Batch welcome. Photos stay on your device — TinyPNG can't say that about its free tier (500/month, uploaded)." });
    p.appendChild(dz.element);
    let mode = H.setting("img-compress","mode","quality");
    p.appendChild(H.field("Mode", H.radioRow([{value:"quality",label:"Quality slider"},{value:"target",label:"Compress to exact KB"}], mode, v=>{ mode=v; H.setSetting("img-compress","mode",v); qBox.classList.toggle("hidden", v!=="quality"); tBox.classList.toggle("hidden", v!=="target"); })));
    const qBox = el("div", mode==="quality"? "" : "hidden");
    const q = H.slider(H.setting("img-compress","q",80), 5, 100, 1);
    const qVal = el("span","fsize", q.value+"%");
    q.oninput = ()=>{ qVal.textContent = q.value+"%"; H.setSetting("img-compress","q", +q.value); };
    const qf = H.field("Quality (JPG / WebP)", q); qf.appendChild(qVal); qBox.appendChild(qf);
    const lv = H.slider(H.setting("img-compress","levels",64), 4, 256, 4);
    const lvVal = el("span","fsize", lv.value+" colours");
    lv.oninput = ()=>{ lvVal.textContent = lv.value+" colours"; H.setSetting("img-compress","levels", +lv.value); };
    const lf = H.field("PNG colours — palette quantization (the TinyPNG trick: a palette PNG at N colours; fewer = smaller)", lv); lf.appendChild(lvVal); qBox.appendChild(lf);
    p.appendChild(qBox);
    const tBox = el("div", mode==="target"? "" : "hidden");
    const kb = H.numInput(H.setting("img-compress","kb",50), 5, 5000, 1); kb.style.width = "120px";
    tBox.appendChild(H.field("Target size — must come in UNDER this many KB", kb, "The portal-form use case: CNIC / visa / exam uploads. Output is JPEG (PNG can't chase a KB target losslessly). Quality is binary-searched, then dimensions step down only if needed."));
    const chips = el("div","btn-row");
    [20, 50, 100, 200, 300].forEach(v=>{ const b = el("button","btn ghost sm", v+" KB"); b.onclick = ()=>{ kb.value = v; H.setSetting("img-compress","kb", v); }; chips.appendChild(b); });
    tBox.appendChild(chips);
    kb.onchange = ()=> H.setSetting("img-compress","kb", +kb.value || 50);
    p.appendChild(tBox);
    const stats = el("div","stat-cards hidden"); p.appendChild(stats);
    const { btn, st, outs, showOut } = actionRow(p, "Compress Images");
    async function toTarget(bmp, targetBytes, mime){
      let scale = 1, smallest = null;
      for(let round = 0; round < 7; round++){
        const c = drawTo(bmp, Math.max(8, Math.round(bmp.width * scale)), Math.max(8, Math.round(bmp.height * scale)));
        let lo = 0.02, hi = 0.97, best = null;
        for(let i = 0; i < 9; i++){
          const qq = (lo + hi) / 2;
          const b = await encode(c, mime, qq);
          if(!b) break;
          if(!smallest || b.size < smallest.size) smallest = b;
          if(b.size <= targetBytes){ best = b; lo = qq; } else hi = qq;
        }
        if(best) return { blob: best, hit: true };
        scale *= 0.72;
      }
      return { blob: smallest, hit: false };
    }
    btn.onclick = async ()=>{
      const files = dz.getFiles(); if(!files.length){ st.err("Add at least one image."); return; }
      btn.disabled = true; outs.clear(); stats.classList.add("hidden"); st.say("Compressing…");
      try{
        let totIn = 0, totOut = 0, misses = [];
        showOut();
        for(let i = 0; i < files.length; i++){
          const f = files[i]; totIn += f.size;
          const bmp = await loadImg(f);
          const srcMime = mimeOf(f);
          if(mode === "target"){
            const target = (+kb.value || 50) * 1024;
            const fmtMime = srcMime === "image/webp" && extOf(f.name) === "webp"? "image/webp" : "image/jpeg";
            const r = await toTarget(bmp, target, fmtMime);
            if(!r.blob) throw new Error("Could not encode "+f.name);
            totOut += r.blob.size;
            outs.add(H.baseName(f.name)+"_under"+(+kb.value || 50)+"kb."+(fmtMime === "image/webp"? "webp":"jpg"), r.blob, H.fmtBytes(f.size)+" → "+H.fmtBytes(r.blob.size)+(r.hit? "" : " · target missed"));
            if(!r.hit) misses.push(f.name+" ("+H.fmtBytes(r.blob.size)+" smallest possible)");
          } else {
            let blob;
            if(srcMime === "image/png"){
              const c = drawTo(bmp, bmp.width, bmp.height);
              const pb = await palettePngBytes(c, +lv.value);
              blob = pb ? new Blob([pb], { type: "image/png" }) : await encode(c, "image/png");
            } else if(srcMime === "image/webp"){
              blob = await encode(drawTo(bmp, bmp.width, bmp.height), "image/webp", (+q.value) / 100);
            } else {
              blob = await encode(drawTo(bmp, bmp.width, bmp.height), "image/jpeg", (+q.value) / 100);
            }
            if(!blob) throw new Error("Could not encode "+f.name);
            totOut += blob.size;
            const ext = srcMime === "image/png"? "png" : srcMime === "image/webp"? "webp" : "jpg";
            outs.add(H.baseName(f.name)+"_compressed."+ext, blob, H.fmtBytes(f.size)+" → "+H.fmtBytes(blob.size)+(blob.size >= f.size? " · already optimal" : ""));
          }
          st.prog((i + 1) / files.length);
        }
        stats.innerHTML = "";
        [["Original total", H.fmtBytes(totIn), ""], ["Compressed total", H.fmtBytes(totOut), totOut < totIn? "good":""], ["Saved", Math.max(0, Math.round((totIn - totOut) / totIn * 100)) + "%", totOut < totIn? "good":""]].forEach(([k, v, cls])=>{
          const c = el("div","stat-card"); c.innerHTML = `<div class="k">${esc(k)}</div><div class="v ${cls}">${esc(v)}</div>`; stats.appendChild(c);
        });
        stats.classList.remove("hidden");
        st.prog(1);
        if(misses.length) st.say("Done, but "+misses.length+" file(s) could not reach the target even at minimum quality/size: "+misses.join(", ")+". That is the honest floor for those photos.", "err");
        else st.ok("Done — "+files.length+" image(s) compressed.");
      }catch(e){ st.err(e.message || String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= RESIZE IMAGE ================= */
const SOCIAL_PRESETS = [
  ["yt-thumb","YouTube thumbnail · 1280×720",1280,720],["ig-post","Instagram post · 1080×1080",1080,1080],
  ["ig-portrait","Instagram portrait · 1080×1350",1080,1350],["ig-story","Instagram story / reel · 1080×1920",1080,1920],
  ["fb-cover","Facebook cover · 1640×924",1640,924],["x-post","Twitter / X post · 1600×900",1600,900],["wa-dp","WhatsApp DP · 640×640",640,640]
];
Onyx.register({ id:"img-resize", name:"Resize Image", icon:"imgresize", tag:"Popular", section:"image",
  blurb:"Exact pixels, percentage, or one-tap social sizes — YouTube thumbnail, Instagram, Facebook cover, WhatsApp DP.",
  keywords:"resize image dimensions pixels percent social media thumbnail instagram youtube",
  mount(root){
    const p = panel(root);
    let first = null;
    const dz = H.dropzone({ accept: IMG_ACCEPT, multiple: true, toolName:"Resize Image", title:"Drop images here",
      onChange: async files=>{ const f = files[0]; if(f){ try{ first = await loadImg(f); info.textContent = "First image: "+first.width+"×"+first.height+" px. Pixel mode applies the same size to every file."; syncFromW(); }catch(e){} } else first = null; } });
    p.appendChild(dz.element);
    const info = el("p","small",""); p.appendChild(info);
    let mode = H.setting("img-resize","mode","px");
    const wIn = H.numInput(H.setting("img-resize","w",1280), 1, 20000, 1);
    const hIn = H.numInput(H.setting("img-resize","h",720), 1, 20000, 1);
    const lock = H.checkRow("Lock aspect ratio", H.setting("img-resize","lock",true));
    const pct = H.slider(H.setting("img-resize","pct",50), 1, 400, 1);
    const pctVal = el("span","fsize", pct.value+"%");
    const presetSel = H.selectInput(SOCIAL_PRESETS.map(([v, t])=> [v, t]), H.setting("img-resize","preset","yt-thumb"));
    const pxBox = el("div"), pctBox = el("div","hidden"), preBox = el("div","hidden");
    const wf = H.field("Width (px)", wIn), hf = H.field("Height (px)", hIn);
    const cols = el("div","cols"); cols.style.gridTemplateColumns = "1fr 1fr"; const c1 = el("div"), c2 = el("div");
    c1.appendChild(wf); c2.appendChild(hf); cols.append(c1, c2); pxBox.append(cols, lock.row);
    const pf = H.field("Scale", pct); pf.appendChild(pctVal); pctBox.appendChild(pf);
    preBox.appendChild(H.field("Preset size", presetSel));
    function showBoxes(){ pxBox.classList.toggle("hidden", mode !== "px"); pctBox.classList.toggle("hidden", mode !== "pct"); preBox.classList.toggle("hidden", mode !== "preset"); }
    p.appendChild(H.field("Resize by", H.radioRow([{value:"px",label:"Pixels"},{value:"pct",label:"Percentage"},{value:"preset",label:"Social preset"}], mode, v=>{ mode = v; H.setSetting("img-resize","mode", v); showBoxes(); })));
    p.append(pxBox, pctBox, preBox); showBoxes();
    function syncFromW(){ if(first && lock.box.checked && +wIn.value > 0){ hIn.value = Math.max(1, Math.round(+wIn.value * first.height / first.width)); } }
    function syncFromH(){ if(first && lock.box.checked && +hIn.value > 0){ wIn.value = Math.max(1, Math.round(+hIn.value * first.width / first.height)); } }
    wIn.oninput = ()=>{ H.setSetting("img-resize","w", +wIn.value); syncFromW(); };
    hIn.oninput = ()=>{ H.setSetting("img-resize","h", +hIn.value); syncFromH(); };
    lock.box.onchange = ()=> H.setSetting("img-resize","lock", lock.box.checked);
    pct.oninput = ()=>{ pctVal.textContent = pct.value+"%"; H.setSetting("img-resize","pct", +pct.value); };
    presetSel.onchange = ()=> H.setSetting("img-resize","preset", presetSel.value);
    const { btn, st, outs, showOut } = actionRow(p, "Resize Images");
    btn.onclick = async ()=>{
      const files = dz.getFiles(); if(!files.length){ st.err("Add at least one image."); return; }
      btn.disabled = true; outs.clear(); st.say("Resizing…");
      try{
        showOut();
        for(let i = 0; i < files.length; i++){
          const f = files[i]; const bmp = await loadImg(f);
          let tw, th;
          if(mode === "pct"){ tw = Math.max(1, Math.round(bmp.width * (+pct.value) / 100)); th = Math.max(1, Math.round(bmp.height * (+pct.value) / 100)); }
          else if(mode === "preset"){ const pr = SOCIAL_PRESETS.find(x=> x[0] === presetSel.value); tw = pr[2]; th = pr[3]; }
          else { tw = Math.max(1, +wIn.value || bmp.width); th = Math.max(1, +hIn.value || bmp.height); }
          const mime = mimeOf(f) === "image/png"? "image/png" : mimeOf(f) === "image/webp"? "image/webp" : "image/jpeg";
          const blob = await encode(drawTo(bmp, tw, th), mime, 0.92);
          outs.add(H.baseName(f.name)+"_"+tw+"x"+th+(mime === "image/png"? ".png" : mime === "image/webp"? ".webp" : ".jpg"), blob, bmp.width+"×"+bmp.height+" → "+tw+"×"+th);
          st.prog((i + 1) / files.length);
        }
        st.prog(1); st.ok("Done — "+files.length+" image(s) resized.");
      }catch(e){ st.err(e.message || String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= CONVERT IMAGE ================= */
Onyx.register({ id:"img-convert", name:"Convert Image", icon:"imgconvert", tag:"Converter", section:"image",
  blurb:"PNG ↔ JPG ↔ WebP ↔ BMP in batches, at the quality you pick. No upload, no reduced resolution — ever.",
  keywords:"convert image png jpg webp bmp format change",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept: IMG_ACCEPT, multiple: true, toolName:"Convert Image", title:"Drop images here",
      hint:"iLoveIMG's free HEIC conversion silently shrinks your photo. Ours never touches the pixel size unless you ask." });
    p.appendChild(dz.element);
    let fmt = H.setting("img-convert","fmt","jpg");
    p.appendChild(H.field("Convert to", H.radioRow([{value:"jpg",label:"JPG"},{value:"png",label:"PNG"},{value:"webp",label:"WebP"},{value:"bmp",label:"BMP"}], fmt, v=>{ fmt = v; H.setSetting("img-convert","fmt", v); })));
    const q = H.slider(H.setting("img-convert","q",92), 10, 100, 1);
    const qVal = el("span","fsize", q.value+"%");
    q.oninput = ()=>{ qVal.textContent = q.value+"%"; H.setSetting("img-convert","q", +q.value); };
    const qf = H.field("Quality (JPG / WebP)", q); qf.appendChild(qVal); p.appendChild(qf);
    const { btn, st, outs, showOut } = actionRow(p, "Convert Images");
    btn.onclick = async ()=>{
      const files = dz.getFiles(); if(!files.length){ st.err("Add at least one image."); return; }
      btn.disabled = true; outs.clear(); st.say("Converting…");
      try{
        showOut();
        for(let i = 0; i < files.length; i++){
          const f = files[i]; const bmp = await loadImg(f);
          const blob = await encodeAs(drawTo(bmp, bmp.width, bmp.height), fmt, (+q.value) / 100, "#ffffff");
          if(!blob) throw new Error("Could not encode "+f.name);
          outs.add(H.baseName(f.name)+"."+fmt, blob, bmp.width+"×"+bmp.height);
          st.prog((i + 1) / files.length);
        }
        st.prog(1); st.ok("Done — "+files.length+" image(s) converted to "+fmt.toUpperCase()+".");
      }catch(e){ st.err(e.message || String(e)); }
      btn.disabled = false;
    };
  }
});

/* ---------- shared drag-select stage (cached render + pointer capture — the fixed PDF Crop pattern) ----------
   paint() redraws the cached image synchronously; selection is NEVER cleared by a re-render. */
function dragStage(onPaintExtra){
  const stage = el("div","stage-wrap mt"); stage.style.cursor = "crosshair";
  const cv = el("canvas"); stage.appendChild(cv);
  let base = null, sel = null;
  function paint(final){
    if(!base) return;
    const g = cv.getContext("2d"); g.drawImage(base, 0, 0);
    if(onPaintExtra) onPaintExtra(g, cv, sel, final);
    if(sel){
      if(final){ g.fillStyle = "rgba(0,0,0,.45)"; g.fillRect(0, 0, cv.width, sel.y); g.fillRect(0, sel.y + sel.h, cv.width, cv.height - sel.y - sel.h); g.fillRect(0, sel.y, sel.x, sel.h); g.fillRect(sel.x + sel.w, sel.y, cv.width - sel.x - sel.w, sel.h); }
      g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent") || "#22d3ee";
      g.lineWidth = 2; if(!final) g.setLineDash([6, 4]); g.strokeRect(sel.x, sel.y, sel.w, sel.h); g.setLineDash([]);
    }
  }
  return { stage, cv,
    setImage(canvas){ base = canvas; cv.width = canvas.width; cv.height = canvas.height; sel = null; paint(false); },
    getSel(){ return sel; }, clearSel(){ sel = null; paint(false); }, paint,
    onFinal: null,
    bind(getRatio){
      let start = null;
      const pos = e=>{ const r = cv.getBoundingClientRect(); return { x: Math.max(0, Math.min(cv.width, (e.clientX - r.left) * (cv.width / r.width))), y: Math.max(0, Math.min(cv.height, (e.clientY - r.top) * (cv.height / r.height))) }; };
      cv.addEventListener("pointerdown", e=>{ if(!base) return; start = pos(e); sel = null; try{ cv.setPointerCapture(e.pointerId); }catch(_){ } });
      cv.addEventListener("pointermove", e=>{ if(!start) return; const q = pos(e);
        const dx = q.x - start.x, dy = q.y - start.y;
        let w = Math.abs(dx), h = Math.abs(dy);
        const ratio = getRatio? getRatio() : 0;
        if(ratio){
          h = w / ratio;
          let x = dx >= 0? start.x : start.x - w;
          let y = dy >= 0? start.y : start.y - h;
          if(x < 0){ w += x; x = 0; h = w / ratio; y = dy >= 0? start.y : start.y - h; }
          if(y < 0){ h += y; y = 0; w = h * ratio; x = dx >= 0? start.x : start.x - w; }
          if(x + w > cv.width){ w = cv.width - x; h = w / ratio; }
          if(y + h > cv.height){ h = cv.height - y; w = h * ratio; }
          sel = { x, y, w, h };
        } else {
          sel = { x: Math.min(start.x, q.x), y: Math.min(start.y, q.y), w, h };
        }
        paint(false);
      });
      const end = ()=>{ if(!start) return; start = null; if(sel && sel.w >= 4 && sel.h >= 4){ paint(true); if(this.onFinal) this.onFinal(sel); } else { sel = null; paint(false); if(this.onFinal) this.onFinal(null); } };
      cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
    }
  };
}
function fitStage(bmp, maxW, maxH){
  const s = Math.min(maxW / bmp.width, maxH / bmp.height, 1.6);
  return drawTo(bmp, Math.max(1, Math.round(bmp.width * s)), Math.max(1, Math.round(bmp.height * s)));
}


/* ================= CROP IMAGE ================= */
const CROP_RATIOS = [["free","Free",0],["1:1","1 : 1 square",1],["4:3","4 : 3",4/3],["3:2","3 : 2",3/2],["16:9","16 : 9",16/9],["35:45","Passport 35:45",35/45],["2:3","2 : 3",2/3]];
Onyx.register({ id:"img-crop", name:"Crop Image", icon:"imgcrop", section:"image",
  blurb:"Drag a box on the photo — free-form or locked to 1:1, 4:3, 16:9 or passport ratio. Cropped at full resolution.",
  keywords:"crop image trim cut photo aspect ratio",
  mount(root){
    const p = panel(root);
    let bmp = null, fileName = "image";
    const ds = dragStage(null);
    const dz = H.dropzone({ accept: IMG_ACCEPT, multiple:false, toolName:"Crop Image", title:"Drop an image here",
      onChange: async files=>{ const f = files[0]; bmp = null; if(f){ fileName = f.name; bmp = await loadImg(f); ds.setImage(fitStage(bmp, 880, 760)); info.textContent = "Drag on the image to choose the area to keep."; } } });
    p.appendChild(dz.element);
    let ratioKey = H.setting("img-crop","ratio","free");
    p.appendChild(H.field("Aspect ratio", H.radioRow(CROP_RATIOS.map(([v, t])=> ({ value: v, label: t })), ratioKey, v=>{ ratioKey = v; H.setSetting("img-crop","ratio", v); ds.clearSel(); info.textContent = "Drag on the image to choose the area to keep."; })));
    p.appendChild(ds.stage);
    const info = el("div","small mt","Drop an image, then drag a box on it."); p.appendChild(info);
    ds.bind(()=>{ const r = CROP_RATIOS.find(x=> x[0] === ratioKey); return r? r[2] : 0; });
    ds.onFinal = s=>{
      if(!bmp) return;
      if(!s){ info.textContent = "Drag on the image to choose the area to keep."; return; }
      const sx = bmp.width / ds.cv.width, sy = bmp.height / ds.cv.height;
      info.textContent = "Selected area: "+Math.round(s.w * sx)+" × "+Math.round(s.h * sy)+" px of "+bmp.width+"×"+bmp.height+". Click “Crop & Download”.";
    };
    let fmt = H.setting("img-crop","fmt","jpg");
    p.appendChild(H.field("Output format", H.radioRow([{value:"jpg",label:"JPG"},{value:"png",label:"PNG"}], fmt, v=>{ fmt = v; H.setSetting("img-crop","fmt", v); })));
    const { btn, st, outs, showOut } = actionRow(p, "Crop & Download");
    btn.onclick = async ()=>{
      if(!bmp){ st.err("Add an image first."); return; }
      const s = ds.getSel(); if(!s){ st.err("Drag a box on the image first to choose the area to keep."); return; }
      btn.disabled = true; st.say("Cropping…");
      try{
        const sx = bmp.width / ds.cv.width, sy = bmp.height / ds.cv.height;
        const x = Math.round(s.x * sx), y = Math.round(s.y * sy), w = Math.round(s.w * sx), h = Math.round(s.h * sy);
        const out = mkCanvas(w, h); out.getContext("2d").drawImage(bmp, x, y, w, h, 0, 0, w, h);
        const blob = await encodeAs(out, fmt, 0.92, "#ffffff");
        showOut(); outs.add(H.baseName(fileName)+"_cropped_"+w+"x"+h+"."+fmt, blob, w+"×"+h+" px");
        st.ok("Done — cropped to "+w+"×"+h+" px at full resolution.");
      }catch(e){ st.err(e.message || String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= ROTATE & FLIP ================= */
Onyx.register({ id:"img-rotate", name:"Rotate & Flip Image", icon:"imgrotate", section:"image",
  blurb:"Turn photos the right way up: 90° steps, flip horizontal/vertical, or a free angle. Batch-friendly.",
  keywords:"rotate flip mirror image turn 90 angle straighten",
  mount(root){
    const p = panel(root);
    let bmp = null, quarter = 0, flipH = false, flipV = false, angle = 0;
    const dz = H.dropzone({ accept: IMG_ACCEPT, multiple: true, toolName:"Rotate & Flip", title:"Drop images here",
      onChange: async files=>{ const f = files[0]; bmp = null; if(f){ bmp = await loadImg(f); paintPreview(); } } });
    p.appendChild(dz.element);
    const btnRow = el("div","btn-row");
    const mkB = (label, fn)=>{ const b = el("button","btn ghost sm", label); b.onclick = ()=>{ fn(); paintPreview(); }; btnRow.appendChild(b); return b; };
    mkB("⟲ 90° left", ()=> quarter = (quarter + 3) % 4);
    mkB("⟳ 90° right", ()=> quarter = (quarter + 1) % 4);
    mkB("⇋ Flip horizontal", ()=> flipH = !flipH);
    mkB("⇅ Flip vertical", ()=> flipV = !flipV);
    p.appendChild(btnRow);
    const ang = H.slider(0, -45, 45, 0.5);
    const angVal = el("span","fsize","0°");
    ang.oninput = ()=>{ angle = +ang.value; angVal.textContent = angle+"°"; paintPreview(); };
    const af = H.field("Free angle", ang); af.appendChild(angVal); p.appendChild(af);
    const stage = el("div","stage-wrap mt"); const pv = el("canvas"); stage.appendChild(pv); p.appendChild(stage);
    function render(src){
      const rad = (quarter * 90 + angle) * Math.PI / 180;
      const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
      const w = Math.round(src.width * cos + src.height * sin), h = Math.round(src.width * sin + src.height * cos);
      const c = mkCanvas(w, h); const g = c.getContext("2d");
      g.translate(w / 2, h / 2); g.rotate(rad); g.scale(flipH? -1:1, flipV? -1:1);
      g.drawImage(src, -src.width / 2, -src.height / 2);
      return c;
    }
    function paintPreview(){ if(!bmp){ pv.width = 1; pv.height = 1; return; } const c = render(bmp); const s = Math.min(760 / c.width, 560 / c.height, 1); pv.width = Math.round(c.width * s); pv.height = Math.round(c.height * s); pv.getContext("2d").drawImage(c, 0, 0, pv.width, pv.height); }
    const { btn, st, outs, showOut } = actionRow(p, "Apply to All & Download");
    btn.onclick = async ()=>{
      const files = dz.getFiles(); if(!files.length){ st.err("Add at least one image."); return; }
      if(!quarter && !flipH && !flipV && !angle){ st.err("Nothing to apply yet — rotate or flip first."); return; }
      btn.disabled = true; outs.clear(); st.say("Applying…");
      try{
        showOut();
        for(let i = 0; i < files.length; i++){
          const f = files[i]; const b = await loadImg(f); const c = render(b);
          const mime = mimeOf(f) === "image/png"? "image/png" : "image/jpeg";
          const blob = await encode(c, mime, 0.92);
          outs.add(H.baseName(f.name)+"_rotated."+(mime === "image/png"? "png":"jpg"), blob, b.width+"×"+b.height+" → "+c.width+"×"+c.height);
          st.prog((i + 1) / files.length);
        }
        st.prog(1); st.ok("Done.");
      }catch(e){ st.err(e.message || String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= WATERMARK IMAGE ================= */
const WM_POS = [["tl","Top left"],["tc","Top centre"],["tr","Top right"],["ml","Middle left"],["mc","Centre"],["mr","Middle right"],["bl","Bottom left"],["bc","Bottom centre"],["br","Bottom right"]];
Onyx.register({ id:"img-watermark", name:"Watermark Image", icon:"imgwatermark", section:"image",
  blurb:"Stamp your name, © line or logo onto photos — position, size and transparency you control. Batch, like iLoveIMG's paid flow, free here.",
  keywords:"watermark image logo text stamp copyright protect photos",
  mount(root){
    const p = panel(root);
    let bmp = null, logoBmp = null;
    const dz = H.dropzone({ accept: IMG_ACCEPT, multiple: true, toolName:"Watermark Image", title:"Drop images here",
      onChange: async files=>{ const f = files[0]; bmp = null; if(f){ bmp = await loadImg(f); paintPreview(); } } });
    p.appendChild(dz.element);
    let kind = H.setting("img-watermark","kind","text");
    const txt = H.textInput(H.setting("img-watermark","text","© My Name"), "© Your name or brand");
    txt.oninput = ()=>{ H.setSetting("img-watermark","text", txt.value); paintPreview(); };
    const txtF = H.field("Watermark text", txt);
    const logoDz = H.dropzone({ accept: "image/png,image/jpeg,image/webp", multiple:false, toolName:"Watermark Image", title:"Drop a logo image (PNG with transparency works best)",
      onChange: async files=>{ const f = files[0]; logoBmp = null; if(f){ logoBmp = await loadImg(f); paintPreview(); } } });
    logoDz.element.classList.add("hidden");
    p.appendChild(H.field("Watermark type", H.radioRow([{value:"text",label:"Text"},{value:"logo",label:"Logo image"}], kind, v=>{ kind = v; H.setSetting("img-watermark","kind", v); txtF.classList.toggle("hidden", v !== "text"); logoDz.element.classList.toggle("hidden", v !== "logo"); paintPreview(); })));
    txtF.classList.toggle("hidden", kind !== "text");
    p.append(txtF, logoDz.element);
    const posSel = H.selectInput(WM_POS, H.setting("img-watermark","pos","br")); posSel.onchange = ()=>{ H.setSetting("img-watermark","pos", posSel.value); paintPreview(); };
    p.appendChild(H.field("Position", posSel));
    const op = H.slider(H.setting("img-watermark","op",55), 5, 100, 1); const opV = el("span","fsize", op.value+"%");
    op.oninput = ()=>{ opV.textContent = op.value+"%"; H.setSetting("img-watermark","op", +op.value); paintPreview(); };
    const opF = H.field("Opacity", op); opF.appendChild(opV); p.appendChild(opF);
    const sz = H.slider(H.setting("img-watermark","size",22), 4, 80, 1); const szV = el("span","fsize", sz.value+"% of width");
    sz.oninput = ()=>{ szV.textContent = sz.value+"% of width"; H.setSetting("img-watermark","size", +sz.value); paintPreview(); };
    const szF = H.field("Size", sz); szF.appendChild(szV); p.appendChild(szF);
    const tile = H.checkRow("Tile across the whole image", H.setting("img-watermark","tile",false));
    tile.box.onchange = ()=>{ H.setSetting("img-watermark","tile", tile.box.checked); paintPreview(); };
    p.appendChild(tile.row);
    const stage = el("div","stage-wrap mt"); const pv = el("canvas"); stage.appendChild(pv); p.appendChild(stage);
    function drawMark(g, W, Hh){
      g.save(); g.globalAlpha = (+op.value) / 100;
      const m = Math.round(W * 0.03);
      let mw, mh, draw;
      if(kind === "logo" && logoBmp){
        mw = W * (+sz.value) / 100; mh = mw * logoBmp.height / logoBmp.width;
        draw = (x, y)=> g.drawImage(logoBmp, x, y, mw, mh);
      } else {
        const fs = Math.max(10, W * (+sz.value) / 100 * 0.16);
        g.font = "700 "+fs+"px Arial, sans-serif"; g.textBaseline = "middle";
        mw = g.measureText(txt.value || "©").width; mh = fs * 1.5;
        draw = (x, y)=>{ g.save(); g.shadowColor = "rgba(0,0,0,.55)"; g.shadowBlur = fs * 0.12; g.fillStyle = "#ffffff"; g.fillText(txt.value || "©", x, y + mh / 2); g.restore(); };
      }
      if(tile.box.checked){
        const stepX = mw + W * 0.12, stepY = mh + Hh * 0.12;
        for(let y = m; y + mh <= Hh - m + stepY; y += stepY) for(let x = m; x + mw <= W - m + stepX; x += stepX) draw(x, y);
      } else {
        const pos = posSel.value;
        const x = pos[1] === "l"? m : pos[1] === "r"? W - m - mw : (W - mw) / 2;
        const y = pos[0] === "t"? m : pos[0] === "b"? Hh - m - mh : (Hh - mh) / 2;
        draw(x, y);
      }
      g.restore();
    }
    function render(src){ const c = drawTo(src, src.width, src.height); drawMark(c.getContext("2d"), c.width, c.height); return c; }
    function paintPreview(){ if(!bmp){ pv.width = 1; pv.height = 1; return; } const c = render(bmp); const s = Math.min(760 / c.width, 520 / c.height, 1); pv.width = Math.round(c.width * s); pv.height = Math.round(c.height * s); pv.getContext("2d").drawImage(c, 0, 0, pv.width, pv.height); }
    const { btn, st, outs, showOut } = actionRow(p, "Watermark All & Download");
    btn.onclick = async ()=>{
      const files = dz.getFiles(); if(!files.length){ st.err("Add at least one image."); return; }
      if(kind === "text" && !txt.value.trim()){ st.err("Type the watermark text first."); return; }
      if(kind === "logo" && !logoBmp){ st.err("Add a logo image first."); return; }
      btn.disabled = true; outs.clear(); st.say("Stamping…");
      try{
        showOut();
        for(let i = 0; i < files.length; i++){
          const f = files[i]; const b = await loadImg(f); const c = render(b);
          const mime = mimeOf(f) === "image/png"? "image/png" : "image/jpeg";
          const blob = await encode(c, mime, 0.92);
          outs.add(H.baseName(f.name)+"_watermarked."+(mime === "image/png"? "png":"jpg"), blob);
          st.prog((i + 1) / files.length);
        }
        st.prog(1); st.ok("Done — "+files.length+" image(s) watermarked.");
      }catch(e){ st.err(e.message || String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= IMAGE EDITOR ================= */
Onyx.register({ id:"img-editor", name:"Image Editor", icon:"imgedit", section:"image",
  blurb:"Brightness, contrast, saturation, hue and classic looks — with live preview and one-tap filter presets.",
  keywords:"photo editor filters brightness contrast saturation sepia grayscale vintage enhance",
  mount(root){
    const p = panel(root);
    let bmp = null, fileName = "image";
    const dz = H.dropzone({ accept: IMG_ACCEPT, multiple:false, toolName:"Image Editor", title:"Drop an image here",
      onChange: async files=>{ const f = files[0]; bmp = null; if(f){ fileName = f.name; bmp = await loadImg(f); paint(); } } });
    p.appendChild(dz.element);
    const S = (key, def, min, max, lbl, unit)=>{
      const s = H.slider(H.setting("img-editor", key, def), min, max, 1);
      const v = el("span","fsize", s.value + unit);
      s.oninput = ()=>{ v.textContent = s.value + unit; H.setSetting("img-editor", key, +s.value); paint(); };
      const f = H.field(lbl, s); f.appendChild(v); p.appendChild(f);
      return { s, set(val){ s.value = val; v.textContent = val + unit; H.setSetting("img-editor", key, val); } };
    };
    const bright = S("b", 100, 20, 200, "Brightness", "%");
    const contr = S("c", 100, 20, 200, "Contrast", "%");
    const sat = S("s", 100, 0, 300, "Saturation", "%");
    const hue = S("h", 0, -180, 180, "Hue shift", "°");
    const gray = S("g", 0, 0, 100, "Grayscale", "%");
    const sep = S("sep", 0, 0, 100, "Sepia", "%");
    const inv = H.checkRow("Invert colours", false); inv.box.onchange = paint; p.appendChild(inv.row);
    const presets = el("div","btn-row");
    const PRE = { "Normal": [100,100,100,0,0,0,0], "Vivid": [105,115,165,0,0,0,0], "Warm": [108,105,120,8,0,25,0], "Cool": [100,102,95,-12,0,0,0], "B&W": [105,112,0,0,100,0,0], "Sepia": [102,100,80,0,0,90,0], "Vintage": [112,88,70,6,0,45,0], "Fade": [118,82,85,0,0,10,0] };
    Object.keys(PRE).forEach(name=>{
      const b = el("button","btn ghost sm", name);
      b.onclick = ()=>{ const v = PRE[name]; bright.set(v[0]); contr.set(v[1]); sat.set(v[2]); hue.set(v[3]); gray.set(v[4]); sep.set(v[5]); inv.box.checked = !!v[6]; paint(); };
      presets.appendChild(b);
    });
    p.appendChild(presets);
    const stage = el("div","stage-wrap mt"); const pv = el("canvas"); stage.appendChild(pv); p.appendChild(stage);
    function filterStr(){ return `brightness(${bright.s.value}%) contrast(${contr.s.value}%) saturate(${sat.s.value}%) hue-rotate(${hue.s.value}deg) grayscale(${gray.s.value}%) sepia(${sep.s.value}%) invert(${inv.box.checked? 100:0}%)`; }
    function render(src){ const c = mkCanvas(src.width, src.height); const g = c.getContext("2d"); g.filter = filterStr(); g.drawImage(src, 0, 0); return c; }
    function paint(){ if(!bmp){ pv.width = 1; pv.height = 1; return; } const c = render(bmp); const s = Math.min(820 / c.width, 560 / c.height, 1); pv.width = Math.round(c.width * s); pv.height = Math.round(c.height * s); const g = pv.getContext("2d"); g.drawImage(c, 0, 0, pv.width, pv.height); }
    const { btn, st, outs, showOut } = actionRow(p, "Apply & Download");
    btn.onclick = async ()=>{
      if(!bmp){ st.err("Add an image first."); return; }
      btn.disabled = true; st.say("Applying…");
      try{
        const mime = mimeOf({ name: fileName, type: "" }) === "image/png"? "image/png" : "image/jpeg";
        const blob = await encode(render(bmp), mime, 0.92);
        showOut(); outs.add(H.baseName(fileName)+"_edited."+(mime === "image/png"? "png":"jpg"), blob);
        st.ok("Done.");
      }catch(e){ st.err(e.message || String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= ADD TEXT / MEME ================= */
Onyx.register({ id:"img-text", name:"Add Text / Meme Maker", icon:"imgtext", section:"image",
  blurb:"Classic top & bottom meme captions, or text placed anywhere — font, size, colour and outline under your control.",
  keywords:"meme generator add text caption image write on photo",
  mount(root){
    const p = panel(root);
    let bmp = null, fileName = "image";
    const dz = H.dropzone({ accept: IMG_ACCEPT, multiple:false, toolName:"Add Text / Meme", title:"Drop an image here",
      onChange: async files=>{ const f = files[0]; bmp = null; if(f){ fileName = f.name; bmp = await loadImg(f); paint(); } } });
    p.appendChild(dz.element);
    let mode = H.setting("img-text","mode","meme");
    const topIn = H.textInput("", "TOP TEXT"); const botIn = H.textInput("", "BOTTOM TEXT");
    const oneIn = H.textInput("Your text", "Text to place");
    [topIn, botIn, oneIn].forEach(i=> i.oninput = paint);
    const memeBox = el("div"); memeBox.append(H.field("Top text", topIn), H.field("Bottom text", botIn));
    const placeBox = el("div","hidden");
    const xS = H.slider(50, 0, 100, 1), yS = H.slider(85, 0, 100, 1);
    xS.oninput = paint; yS.oninput = paint;
    placeBox.append(H.field("Placed text", oneIn), H.field("Horizontal position %", xS), H.field("Vertical position %", yS));
    p.appendChild(H.field("Style", H.radioRow([{value:"meme",label:"Meme — top & bottom"},{value:"placed",label:"Placed text"}], mode, v=>{ mode = v; H.setSetting("img-text","mode", v); memeBox.classList.toggle("hidden", v !== "meme"); placeBox.classList.toggle("hidden", v !== "placed"); paint(); })));
    memeBox.classList.toggle("hidden", mode !== "meme"); placeBox.classList.toggle("hidden", mode !== "placed");
    p.append(memeBox, placeBox);
    const fontSel = H.selectInput([["Impact, 'Arial Black', sans-serif","Impact / bold"],["Arial, sans-serif","Arial"],["Georgia, serif","Georgia"],["'Courier New', monospace","Courier (typewriter)"]], H.setting("img-text","font","Impact, 'Arial Black', sans-serif"));
    fontSel.onchange = ()=>{ H.setSetting("img-text","font", fontSel.value); paint(); };
    p.appendChild(H.field("Font", fontSel));
    const sizeS = H.slider(H.setting("img-text","size",9), 3, 30, 0.5); const sizeV = el("span","fsize", sizeS.value+"% of width");
    sizeS.oninput = ()=>{ sizeV.textContent = sizeS.value+"% of width"; H.setSetting("img-text","size", +sizeS.value); paint(); };
    const sizeF = H.field("Text size", sizeS); sizeF.appendChild(sizeV); p.appendChild(sizeF);
    const colIn = el("input"); colIn.type = "color"; colIn.value = H.setting("img-text","color","#ffffff"); colIn.oninput = ()=>{ H.setSetting("img-text","color", colIn.value); paint(); };
    p.appendChild(H.field("Text colour", colIn));
    const outl = H.checkRow("Dark outline (readable on any photo)", true); outl.box.onchange = paint; p.appendChild(outl.row);
    const stage = el("div","stage-wrap mt"); const pv = el("canvas"); stage.appendChild(pv); p.appendChild(stage);
    function drawTextBlock(g, text, W, cx, cy){
      if(!text || !text.trim()) return;
      const fs = Math.max(10, W * (+sizeS.value) / 100);
      g.font = "700 "+fs+"px "+fontSel.value; g.textAlign = "center"; g.textBaseline = "middle";
      if(outl.box.checked){ g.lineWidth = fs / 7; g.strokeStyle = "rgba(0,0,0,.85)"; g.lineJoin = "round"; g.strokeText(text.toUpperCase(), cx, cy); }
      g.fillStyle = colIn.value; g.fillText(text.toUpperCase(), cx, cy);
    }
    function render(src){
      const c = drawTo(src, src.width, src.height); const g = c.getContext("2d");
      if(mode === "meme"){
        const fs = Math.max(10, c.width * (+sizeS.value) / 100);
        drawTextBlock(g, topIn.value, c.width, c.width / 2, fs * 0.75);
        drawTextBlock(g, botIn.value, c.width, c.width / 2, c.height - fs * 0.75);
      } else {
        drawTextBlock(g, oneIn.value, c.width, c.width * (+xS.value) / 100, c.height * (+yS.value) / 100);
      }
      return c;
    }
    function paint(){ if(!bmp){ pv.width = 1; pv.height = 1; return; } const c = render(bmp); const s = Math.min(820 / c.width, 560 / c.height, 1); pv.width = Math.round(c.width * s); pv.height = Math.round(c.height * s); pv.getContext("2d").drawImage(c, 0, 0, pv.width, pv.height); }
    const { btn, st, outs, showOut } = actionRow(p, "Create & Download");
    btn.onclick = async ()=>{
      if(!bmp){ st.err("Add an image first."); return; }
      btn.disabled = true; st.say("Rendering…");
      try{
        const blob = await encode(render(bmp), "image/jpeg", 0.92);
        showOut(); outs.add(H.baseName(fileName)+"_meme.jpg", blob);
        st.ok("Done.");
      }catch(e){ st.err(e.message || String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= PASSPORT PHOTO ================= */
const PASSPORT_SPECS = [["3545","35 × 45 mm · CNIC / passport / Schengen", 413, 531], ["22","2 × 2 inch · US visa", 600, 600]];
Onyx.register({ id:"img-passport", name:"Passport Photo Maker", icon:"passport", tag:"New", section:"image",
  blurb:"Exact-size ID photos at 300 DPI — 35×45 mm (CNIC, passport, Schengen) or 2×2 in (US visa) — plus a printable 4R sheet of copies.",
  keywords:"passport photo maker id visa cnic nadra 35x45 2x2 print sheet photo",
  mount(root){
    const p = panel(root);
    let bmp = null, fileName = "photo";
    let spec = PASSPORT_SPECS.find(x=> x[0] === H.setting("img-passport","spec","3545")) || PASSPORT_SPECS[0];
    let zoom = 1, offX = 0, offY = 0;
    const dz = H.dropzone({ accept: IMG_ACCEPT, multiple:false, toolName:"Passport Photo", title:"Drop a portrait photo here",
      hint:"Drag the photo inside the frame and zoom until the face fills it (head + shoulders, eyes near the guide line). Nothing is uploaded." ,
      onChange: async files=>{ const f = files[0]; bmp = null; if(f){ fileName = f.name; bmp = await loadImg(f); zoom = 1; offX = 0; offY = 0; paint(); } } });
    p.appendChild(dz.element);
    const specSel = H.selectInput(PASSPORT_SPECS.map(([v, t])=> [v, t]), spec[0]);
    specSel.onchange = ()=>{ spec = PASSPORT_SPECS.find(x=> x[0] === specSel.value); H.setSetting("img-passport","spec", specSel.value); zoom = 1; offX = 0; offY = 0; paint(); };
    p.appendChild(H.field("Photo size", specSel));
    const bgSel = H.selectInput([["none","Keep photo background"],["#ffffff","White"],["#d7e9f5","Light blue"]], H.setting("img-passport","bg","#ffffff"));
    bgSel.onchange = ()=>{ H.setSetting("img-passport","bg", bgSel.value); paint(); };
    p.appendChild(H.field("Background fill (shows only where the photo doesn't cover the frame)", bgSel));
    const zoomS = H.slider(100, 100, 300, 1); const zoomV = el("span","fsize","100%");
    zoomS.oninput = ()=>{ zoom = (+zoomS.value) / 100; zoomV.textContent = zoomS.value+"%"; paint(); };
    const zf = H.field("Zoom", zoomS); zf.appendChild(zoomV); p.appendChild(zf);
    const stage = el("div","stage-wrap mt"); const cv = el("canvas"); stage.appendChild(cv); p.appendChild(stage);
    p.appendChild(el("p","small","Guides: the oval is where the face belongs (70–80% of the height for most ID rules); the line marks eye level. Guides never print."));
    function layout(){
      const W = spec[2], Hh = spec[3];
      const cover = Math.max(W / bmp.width, Hh / bmp.height) * zoom;
      const dw = bmp.width * cover, dh = bmp.height * cover;
      return { W, Hh, dw, dh, x: (W - dw) / 2 + offX, y: (Hh - dh) / 2 + offY };
    }
    function render(withGuides){
      const { W, Hh, dw, dh, x, y } = layout();
      const c = mkCanvas(W, Hh); const g = c.getContext("2d");
      if(bgSel.value !== "none"){ g.fillStyle = bgSel.value; g.fillRect(0, 0, W, Hh); }
      g.drawImage(bmp, x, y, dw, dh);
      if(withGuides){
        g.save(); g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent") || "#22d3ee"; g.lineWidth = 2; g.setLineDash([7, 5]);
        g.beginPath(); g.ellipse(W / 2, Hh * 0.46, W * 0.26, Hh * 0.30, 0, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(W * 0.08, Hh * 0.44); g.lineTo(W * 0.92, Hh * 0.44); g.stroke();
        g.restore();
      }
      return c;
    }
    function paint(){ if(!bmp){ cv.width = spec[2]; cv.height = spec[3]; const g = cv.getContext("2d"); g.fillStyle = "#8882"; g.fillRect(0, 0, cv.width, cv.height); return; } const c = render(true); cv.width = c.width; cv.height = c.height; cv.getContext("2d").drawImage(c, 0, 0); }
    let dragP = null;
    cv.addEventListener("pointerdown", e=>{ if(!bmp) return; dragP = { x: e.clientX, y: e.clientY, ox: offX, oy: offY }; try{ cv.setPointerCapture(e.pointerId); }catch(_){ } });
    cv.addEventListener("pointermove", e=>{ if(!dragP || !bmp) return; const r = cv.getBoundingClientRect(); offX = dragP.ox + (e.clientX - dragP.x) * (cv.width / r.width); offY = dragP.oy + (e.clientY - dragP.y) * (cv.height / r.height); paint(); });
    const endP = ()=> dragP = null;
    cv.addEventListener("pointerup", endP); cv.addEventListener("pointercancel", endP);
    paint();
    const { btn, st, outs, showOut } = actionRow(p, "Make Photo + Print Sheet");
    btn.onclick = async ()=>{
      if(!bmp){ st.err("Add a portrait photo first."); return; }
      btn.disabled = true; outs.clear(); st.say("Building…");
      try{
        const photo = render(false);
        const jpg = await encode(photo, "image/jpeg", 0.94);
        showOut(); outs.add("passport_"+spec[2]+"x"+spec[3]+".jpg", jpg, spec[2]+"×"+spec[3]+" px @300 DPI · "+H.fmtBytes(jpg.size));
        // 4R sheet: 1200×1800 px (4×6 in @300 dpi), copies grid with gaps
        const SW = 1200, SH = 1800, gap = 14, marg = 40;
        const cols = Math.max(1, Math.floor((SW - marg * 2 + gap) / (photo.width + gap)));
        const rows = Math.max(1, Math.floor((SH - marg * 2 + gap) / (photo.height + gap)));
        const sheet = mkCanvas(SW, SH); const g = sheet.getContext("2d");
        g.fillStyle = "#ffffff"; g.fillRect(0, 0, SW, SH);
        const gridW = cols * photo.width + (cols - 1) * gap, gridH = rows * photo.height + (rows - 1) * gap;
        const x0 = (SW - gridW) / 2, y0 = (SH - gridH) / 2;
        for(let rI = 0; rI < rows; rI++) for(let cI = 0; cI < cols; cI++) g.drawImage(photo, x0 + cI * (photo.width + gap), y0 + rI * (photo.height + gap));
        const sheetBlob = await encode(sheet, "image/png");
        outs.add("passport_sheet_4R.png", sheetBlob, cols * rows+" copies on 4×6 in @300 DPI");
        st.ok("Done — single photo ("+spec[2]+"×"+spec[3]+" px) + a print sheet with "+(cols * rows)+" copies.");
      }catch(e){ st.err(e.message || String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= HEIC → JPG ================= */
Onyx.register({ id:"img-heic", name:"HEIC to JPG", icon:"heic", tag:"New", section:"image",
  blurb:"Convert iPhone HEIC/HEIF photos to JPG at full resolution, on your device. (iLoveIMG's free tier quietly shrinks them — this doesn't.)",
  keywords:"heic heif iphone photo convert jpg apple",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept: ".heic,.heif,image/heic,image/heif", multiple: true, toolName:"HEIC to JPG", title:"Drop HEIC photos here",
      hint:"The converter engine (libheif, ~1.3 MB) loads once, only when you use this tool, then works offline." });
    p.appendChild(dz.element);
    const q = H.slider(H.setting("img-heic","q",92), 40, 100, 1);
    const qVal = el("span","fsize", q.value+"%");
    q.oninput = ()=>{ qVal.textContent = q.value+"%"; H.setSetting("img-heic","q", +q.value); };
    const qf = H.field("JPG quality", q); qf.appendChild(qVal); p.appendChild(qf);
    let engineP = null;
    function loadEngine(){
      if(window.heic2any) return Promise.resolve();
      if(!engineP){
        engineP = new Promise((res, rej)=>{
          const s = document.createElement("script");
          s.src = "vendor/heic/heic2any.min.js";
          s.onload = ()=> window.heic2any? res() : rej(new Error("HEIC engine loaded but did not initialise."));
          s.onerror = ()=> rej(new Error("The HEIC engine could not be loaded. If you are offline, open this tool once while online so it can be cached."));
          document.head.appendChild(s);
        });
      }
      return engineP;
    }
    const { btn, st, outs, showOut } = actionRow(p, "Convert to JPG");
    btn.onclick = async ()=>{
      const files = dz.getFiles(); if(!files.length){ st.err("Add at least one HEIC photo."); return; }
      btn.disabled = true; outs.clear(); st.say("Loading the HEIC engine (first time only)…");
      try{
        await loadEngine();
        showOut();
        const fails = [];
        for(let i = 0; i < files.length; i++){
          const f = files[i];
          try{
            const out = await window.heic2any({ blob: f, toType: "image/jpeg", quality: (+q.value) / 100 });
            const blobs = Array.isArray(out)? out : [out];
            for(let k = 0; k < blobs.length; k++){
              outs.add(H.baseName(f.name)+(blobs.length > 1? "_"+(k + 1) : "")+".jpg", blobs[k], H.fmtBytes(f.size)+" → "+H.fmtBytes(blobs[k].size));
            }
          }catch(err){ fails.push(f.name+": "+(err && err.message? err.message : "not a valid HEIC file")); }
          st.prog((i + 1) / files.length);
        }
        st.prog(1);
        if(fails.length) st.say("Converted what it could. Failed: "+fails.join(" · "), files.length > fails.length? "" : "err");
        else st.ok("Done — "+files.length+" HEIC photo(s) converted at full resolution.");
      }catch(e){ st.err(e.message || String(e)); }
      btn.disabled = false;
    };
  }
});
})();
