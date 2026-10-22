/* OnyxPDF — scanner tools: Scan Enhance (perspective + filters) and OCR.
   The CamScanner feature set — free, watermark-free, and the photo never leaves the device. */
(function(){
"use strict";
const H = window.H, { el, esc } = H;
const { PDFDocument } = window.PDFLib;

function panel(root){ const p = el("div","panel"); root.appendChild(p); return p; }

/* ================= SCAN ENHANCE ================= */
Onyx.register({ id:"scan", name:"Scan Enhance", icon:"scan", tag:"CamScanner charges for this",
  blurb:"Photograph a document, drag the corners straight, apply pro document filters, save as PDF. The CamScanner workflow — free, no watermark, no cloud.",
  keywords:"scan scanner photo document camscanner perspective crop enhance id card receipt camera",
  mount(root){
    const p = panel(root);
    let img = null; // source canvas
    let corners = null; // [{fx,fy} x4] as fractions of the image size (TL,TR,BR,BL)
    const dz = H.dropzone({ accept:"image/*", multiple:false, toolName:"Scan Enhance",
      title:"Drop a photo of a document", hint:"On a phone you'll be offered the camera. The photo is processed only on this device.",
      onChange: files=>{ if(files[0]) loadImage(files[0]); } });
    p.appendChild(dz.element);
    const stageBox = el("div","mt hidden");
    const stage = el("div","scan-stage"); stageBox.appendChild(stage);
    const srcCanvas = el("canvas"); stage.appendChild(srcCanvas);
    p.appendChild(stageBox);
    /* controls */
    const ctlPanel = panel(root); ctlPanel.classList.add("hidden");
    let filter = "enhanced";
    ctlPanel.appendChild(H.field("Document filter", H.radioRow([
      {value:"original", label:"Original"},{value:"enhanced", label:"Enhanced colour"},{value:"gray", label:"Grayscale"},{value:"bw", label:"B&W document"}
    ], filter, v=> filter = v)));
    const bIn = H.slider(0, -60, 60, 1); const cIn = H.slider(8, -60, 80, 1); const tIn = H.slider(150, 60, 230, 1);
    const bRow = H.field("Brightness", bIn), cRow = H.field("Contrast", cIn), tRow = H.field("B&W threshold (B&W mode)", tIn);
    ctlPanel.append(bRow, cRow, tRow);
    const procBtn = el("button","btn","Process scan");
    const btnRow = el("div","btn-row"); btnRow.appendChild(procBtn); ctlPanel.appendChild(btnRow);
    const st = H.statusBox(ctlPanel);
    const outPanel = panel(root); outPanel.classList.add("hidden");
    const resultWrap = el("div","stage-wrap"); const resultCanvas = el("canvas"); resultWrap.appendChild(resultCanvas); outPanel.appendChild(resultWrap);
    const dlRow = el("div","btn-row");
    const dlImg = el("button","btn ghost","Download image (JPG)");
    const addPdf = el("button","btn ghost","Add page to PDF batch");
    const dlPdf = el("button","btn","Download batch PDF (0 pages)"); dlPdf.disabled = true;
    dlRow.append(dlImg, addPdf, dlPdf); outPanel.appendChild(dlRow);
    const batch = []; // canvases
    function updateBatchBtn(){ dlPdf.textContent = "Download batch PDF ("+batch.length+" page"+(batch.length===1?"":"s")+")"; dlPdf.disabled = !batch.length; }
    async function loadImage(f){
      try{
        const bmp = await createImageBitmap(f);
        const maxDim = 2600; const s = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
        srcCanvas.width = Math.round(bmp.width * s); srcCanvas.height = Math.round(bmp.height * s);
        srcCanvas.getContext("2d").drawImage(bmp, 0, 0, srcCanvas.width, srcCanvas.height);
        img = srcCanvas;
        stageBox.classList.remove("hidden"); ctlPanel.classList.remove("hidden");
        corners = [ {fx:0.07,fy:0.07}, {fx:0.93,fy:0.07}, {fx:0.93,fy:0.93}, {fx:0.07,fy:0.93} ];
        drawCorners();
        st.say("Drag the four dots onto the document's corners, pick a filter, then Process.");
      }catch(e){ st.err(e.message||String(e)); }
    }
    function drawCorners(){
      H.$$(".corner-dot", stage).forEach(n=> n.remove());
      corners.forEach(c=>{
        const d = el("div","corner-dot");
        d.style.left = (c.fx*100)+"%"; d.style.top = (c.fy*100)+"%";
        d.addEventListener("pointerdown", e=>{
          e.preventDefault(); d.setPointerCapture(e.pointerId);
          const move = ev=>{ const r = srcCanvas.getBoundingClientRect();
            c.fx = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
            c.fy = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
            d.style.left = (c.fx*100)+"%"; d.style.top = (c.fy*100)+"%"; };
          const up = ()=>{ d.removeEventListener("pointermove", move); d.removeEventListener("pointerup", up); };
          d.addEventListener("pointermove", move); d.addEventListener("pointerup", up);
        });
        stage.appendChild(d);
      });
    }
    function cornerPx(){ return corners.map(c=> ({ x: c.fx * srcCanvas.width, y: c.fy * srcCanvas.height })); }
    function bilinear(u, v){
      const [tl, tr, br, bl] = cornerPx();
      const top = { x: tl.x + (tr.x - tl.x) * u, y: tl.y + (tr.y - tl.y) * u };
      const bot = { x: bl.x + (br.x - bl.x) * u, y: bl.y + (br.y - bl.y) * u };
      return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
    }
    function drawTri(g, s, d){
      const det = (s[1].x - s[0].x) * (s[2].y - s[0].y) - (s[2].x - s[0].x) * (s[1].y - s[0].y);
      if(Math.abs(det) < 0.001) return;
      const a = ((d[1].x - d[0].x) * (s[2].y - s[0].y) - (d[2].x - d[0].x) * (s[1].y - s[0].y)) / det;
      const b = ((d[2].x - d[0].x) * (s[1].x - s[0].x) - (d[1].x - d[0].x) * (s[2].x - s[0].x)) / det;
      const c2 = ((d[1].y - d[0].y) * (s[2].y - s[0].y) - (d[2].y - d[0].y) * (s[1].y - s[0].y)) / det;
      const d2 = ((d[2].y - d[0].y) * (s[1].x - s[0].x) - (d[1].y - d[0].y) * (s[2].x - s[0].x)) / det;
      const e = d[0].x - a * s[0].x - b * s[0].y, f = d[0].y - c2 * s[0].x - d2 * s[0].y;
      g.save(); g.beginPath(); g.moveTo(d[0].x, d[0].y); g.lineTo(d[1].x, d[1].y); g.lineTo(d[2].x, d[2].y); g.closePath(); g.clip();
      g.setTransform(a, c2, b, d2, e, f); g.drawImage(img, 0, 0); g.restore(); g.setTransform(1, 0, 0, 1, 0, 0);
    }
    function warp(){
      const [tl, tr, br, bl] = cornerPx();
      const dist = (a, b)=> Math.hypot(a.x - b.x, a.y - b.y);
      const W = Math.round(Math.max(dist(tl, tr), dist(bl, br)));
      const Hh = Math.round(Math.max(dist(tl, bl), dist(tr, br)));
      resultCanvas.width = Math.max(50, W); resultCanvas.height = Math.max(50, Hh);
      const g = resultCanvas.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, W, Hh);
      const N = 22;
      for(let i=0;i<N;i++) for(let j=0;j<N;j++){
        const u0 = i/N, u1 = (i+1)/N, v0 = j/N, v1 = (j+1)/N;
        const s00 = bilinear(u0, v0), s10 = bilinear(u1, v0), s11 = bilinear(u1, v1), s01 = bilinear(u0, v1);
        const d00 = { x: u0*W, y: v0*Hh }, d10 = { x: u1*W, y: v0*Hh }, d11 = { x: u1*W, y: v1*Hh }, d01 = { x: u0*W, y: v1*Hh };
        drawTri(g, [s00, s10, s01], [d00, d10, d01]);
        drawTri(g, [s10, s11, s01], [d10, d11, d01]);
      }
      applyFilters(g, W, Hh);
    }
    function applyFilters(g, W, Hh){
      const imgData = g.getImageData(0, 0, W, Hh); const d = imgData.data;
      const bright = +bIn.value, contrast = +cIn.value, thr = +tIn.value;
      const cFactor = Math.max(0.2, Math.min(3, 1 + contrast / 100));
      if(filter === "enhanced"){
        // gentle per-channel stretch using sampled percentiles
        const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
        for(let i=0;i<d.length;i+=16){ hist[0][d[i]]++; hist[1][d[i+1]]++; hist[2][d[i+2]]++; }
        const cuts = hist.map(h=>{ const total = h.reduce((a,b)=> a+b, 0); let acc = 0, lo = 0, hi = 255;
          for(let v=0;v<256;v++){ acc += h[v]; if(acc > total * 0.01){ lo = v; break; } }
          acc = 0; for(let v=255;v>=0;v--){ acc += h[v]; if(acc > total * 0.01){ hi = v; break; } }
          return [lo, Math.max(lo + 1, hi)]; });
        for(let i=0;i<d.length;i+=4){
          for(let ch=0;ch<3;ch++){
            let v = (d[i+ch] - cuts[ch][0]) * 255 / (cuts[ch][1] - cuts[ch][0]);
            const avg = (d[i] + d[i+1] + d[i+2]) / 3;
            v = avg + (v - avg) * 1.28; // saturation push around luminance
            d[i+ch] = Math.max(0, Math.min(255, (v - 128) * cFactor + 128 + bright));
          }
        }
      } else if(filter === "gray" || filter === "bw"){
        for(let i=0;i<d.length;i+=4){
          let y = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
          y = (y - 128) * cFactor + 128 + bright;
          if(filter === "bw") y = y < thr? 0 : 255;
          d[i] = d[i+1] = d[i+2] = Math.max(0, Math.min(255, y));
        }
      } else {
        if(bright || contrast) for(let i=0;i<d.length;i+=4) for(let ch=0;ch<3;ch++) d[i+ch] = Math.max(0, Math.min(255, (d[i+ch] - 128) * cFactor + 128 + bright));
      }
      g.putImageData(imgData, 0, 0);
    }
    procBtn.onclick = ()=>{ if(!img){ st.err("Load a photo first."); return; } st.say("Processing…"); setTimeout(()=>{ warp(); outPanel.classList.remove("hidden"); st.ok("Scan processed — download it as an image, or add it to a multi-page PDF batch."); }, 30); };
    dlImg.onclick = async ()=>{ const bytes = await H.canvasToBytes(resultCanvas, "image/jpeg", 0.92); H.downloadBytes(bytes, "scan.jpg", "image/jpeg"); };
    addPdf.onclick = ()=>{ const c = el("canvas"); c.width = resultCanvas.width; c.height = resultCanvas.height; c.getContext("2d").drawImage(resultCanvas, 0, 0); batch.push(c); updateBatchBtn(); H.toast("Page added — "+batch.length+" in the batch"); };
    dlPdf.onclick = async ()=>{
      if(!batch.length) return;
      const doc = await PDFDocument.create();
      for(const c of batch){
        const bytes = await H.canvasToBytes(c, "image/jpeg", 0.9);
        const im = await doc.embedJpg(bytes);
        const wPt = 595.28; const hPt = wPt * c.height / c.width;
        const pg = doc.addPage([wPt, hPt]); pg.drawImage(im, { x: 0, y: 0, width: wPt, height: hPt });
      }
      H.downloadBytes(await doc.save({ useObjectStreams: true }), "scans.pdf");
      H.toast("Batch PDF downloaded");
    };
  }
});

/* ================= OCR ================= */
let tessLoading = null;
function loadTesseract(){
  if(window.Tesseract) return Promise.resolve();
  if(tessLoading) return tessLoading;
  tessLoading = new Promise((res, rej)=>{
    const s = document.createElement("script"); s.src = "vendor/tesseract.min.js";
    s.onload = ()=> res(); s.onerror = ()=> rej(new Error("Could not load the OCR engine files."));
    document.head.appendChild(s);
  });
  return tessLoading;
}
Onyx.register({ id:"ocr", name:"OCR — Image & Scan to Text", icon:"ocr", tag:"CamScanner charges for this",
  blurb:"Recognise text in photos and scanned PDFs — English, Urdu, Arabic, Hindi, Spanish, French, German. Runs on your device; CamScanner charges for this.",
  keywords:"ocr text recognition image to text scan searchable urdu arabic hindi extract words photo",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept:"image/*,.pdf", multiple:true, toolName:"OCR", title:"Drop images or a scanned PDF",
      hint:"Multiple images are read one after another. For PDFs, every page is rendered and read." });
    p.appendChild(dz.element);
    const lang = H.selectInput([["eng","English"],["urd","Urdu — اردو"],["ara","Arabic — العربية"],["hin","Hindi — हिन्दी"],["spa","Spanish"],["fra","French"],["deu","German"]], H.setting("ocr","lang","eng"));
    lang.onchange = ()=> H.setSetting("ocr","lang", lang.value);
    p.appendChild(H.field("Text language", lang));
    p.appendChild(el("p","small","First use of a language downloads its data pack from this site's own files (already included — nothing is fetched from third parties and nothing of yours is uploaded). OCR on long PDFs takes a while: the engine runs entirely on your device."));
    const row = el("div","btn-row"); const btn = el("button","btn","Run OCR"); row.appendChild(btn); p.appendChild(row);
    const st = H.statusBox(p);
    const outPanel = panel(root); outPanel.classList.add("hidden");
    const ta = el("textarea"); ta.rows = 16; ta.style.cssText = "width:100%;border-radius:10px;border:1px solid var(--border);background:var(--input);padding:12px;font-size:13.5px;line-height:1.6";
    outPanel.appendChild(ta);
    const dlRow = el("div","btn-row");
    const dlBtn = el("button","btn ghost","Download .txt"); const cpBtn = el("button","btn ghost","Copy text");
    dlRow.append(dlBtn, cpBtn); outPanel.appendChild(dlRow);
    let worker = null;
    btn.onclick = async ()=>{
      const files = dz.getFiles(); if(!files.length){ st.err("Add at least one image or PDF."); return; }
      btn.disabled = true;
      try{
        st.say("Loading OCR engine ("+lang.value+")…");
        await loadTesseract();
        if(worker){ try{ await worker.terminate(); }catch(e){} worker = null; }
        worker = await Tesseract.createWorker(lang.value, 1, {
          workerPath: "vendor/tesseract-worker.min.js",
          corePath: "vendor/tess-core",
          langPath: "vendor/tessdata",
          gzip: true,
          cacheMethod: "none",
          logger: m=>{ if(m.status === "recognizing text") st.prog(0.15 + 0.8 * (m.progress||0)); }
        });
        const pieces = [];
        for(let fi=0; fi<files.length; fi++){
          const f = files[fi];
          if(/\.pdf$/i.test(f.name) || f.type === "application/pdf"){
            const js = await H.loadPdfJs(f);
            for(let pn=1; pn<=js.numPages; pn++){
              st.say("Reading "+f.name+" — page "+pn+" of "+js.numPages+"…");
              const { canvas } = await H.renderPage(js, pn, 2);
              const { data } = await worker.recognize(canvas);
              pieces.push("--- "+f.name+" · page "+pn+" ---\n"+data.text.trim());
            }
          } else {
            st.say("Reading "+f.name+"…");
            const bmp = await createImageBitmap(f);
            const c = el("canvas"); const s = Math.min(1, 2400/Math.max(bmp.width, bmp.height));
            c.width = Math.round(bmp.width*s); c.height = Math.round(bmp.height*s); c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
            const { data } = await worker.recognize(c);
            pieces.push("--- "+f.name+" ---\n"+data.text.trim());
          }
        }
        ta.value = pieces.join("\n\n");
        outPanel.classList.remove("hidden");
        st.prog(1); st.ok("Done — OCR complete. Check the text: recognition is good, not perfect, especially on photos taken at an angle (Scan Enhance first helps a lot).");
      }catch(e){ st.err(e.message||String(e)); }
      btn.disabled = false;
    };
    dlBtn.onclick = ()=> H.download(new Blob([ta.value], {type:"text/plain;charset=utf-8"}), "ocr-text.txt");
    cpBtn.onclick = async ()=>{ try{ await navigator.clipboard.writeText(ta.value); H.toast("Text copied"); }catch(e){ ta.select(); document.execCommand("copy"); } };
  }
});
})();
