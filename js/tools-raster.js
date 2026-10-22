/* OnyxPDF — raster tools: Compress, Grayscale, PDF→Images, Images→PDF. */
(function(){
"use strict";
const H = window.H, { el, esc } = H;
const { PDFDocument } = window.PDFLib;

function panel(root){ const p = el("div","panel"); root.appendChild(p); return p; }
function actionRow(parent, label){
  const row = el("div","btn-row"); const btn = el("button","btn", esc(label)); row.appendChild(btn); parent.appendChild(row);
  const st = H.statusBox(parent);
  const outPanel = el("div","panel"); outPanel.classList.add("hidden");
  const outs = H.outputList(); outPanel.appendChild(outs.element); parent.parentNode.appendChild(outPanel);
  return { btn, st, outs, showOut(){ outPanel.classList.remove("hidden"); } };
}
function grayCanvas(src){
  const c = el("canvas"); c.width = src.width; c.height = src.height;
  const g = c.getContext("2d"); g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height); const d = img.data;
  for(let i=0;i<d.length;i+=4){ const y = (d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114)|0; d[i]=d[i+1]=d[i+2]=y; }
  g.putImageData(img, 0, 0); return c;
}
async function rasterize(file, { scale, quality, format, grayscale, onProgress }){
  const js = await H.loadPdfJs(file);
  const out = await PDFDocument.create();
  for(let i=1;i<=js.numPages;i++){
    const page = await js.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const { canvas } = await H.renderPage(js, i, scale);
    const use = grayscale? grayCanvas(canvas) : canvas;
    const bytes = await H.canvasToBytes(use, format==="png"? "image/png":"image/jpeg", quality);
    const img = format==="png"? await out.embedPng(bytes) : await out.embedJpg(bytes);
    const pg = out.addPage([base.width, base.height]);
    pg.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height });
    if(onProgress) onProgress(i/js.numPages);
  }
  return out.save({ useObjectStreams: true });
}

/* ================= COMPRESS ================= */
Onyx.register({ id:"compress", name:"Compress PDF", icon:"compress", tag:"Popular",
  blurb:"Shrink a PDF for email or upload. Image-based compression with honest before/after sizes — plus a lossless mode.",
  keywords:"compress shrink reduce size smaller email optimize",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept:".pdf", multiple:false, toolName:"Compress PDF", title:"Drop a PDF here" });
    p.appendChild(dz.element);
    let mode = H.setting("compress","mode","balanced");
    p.appendChild(H.field("Compression level", H.radioRow([
      {value:"lossless", label:"Lossless optimize"},
      {value:"high", label:"High quality"},
      {value:"balanced", label:"Balanced"},
      {value:"small", label:"Smaller file"},
      {value:"tiny", label:"Maximum shrink"}
    ], mode, v=>{ mode=v; H.setSetting("compress","mode",v); })));
    const expl = el("p","small",
      "Lossless mode re-saves the file structure without touching content — small wins, zero quality loss. " +
      "Image modes re-render each page as a picture: big wins on scans and photo-heavy PDFs, but selectable text becomes part of the image. " +
      "If a file is already well-optimized, the result can occasionally be larger — we always show you the real numbers.");
    p.appendChild(expl);
    const stats = el("div","stat-cards hidden"); p.appendChild(stats);
    const { btn, st, outs, showOut } = actionRow(p, "Compress PDF");
    btn.onclick = async ()=>{
      const file = dz.getFiles()[0]; if(!file){ st.err("Choose a PDF first."); return; }
      btn.disabled = true; stats.classList.add("hidden"); st.say("Working…");
      try{
        let bytes;
        if(mode === "lossless"){
          const doc = await H.loadPdf(file);
          bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false });
          st.prog(1);
        } else {
          const presets = { high:{scale:2, quality:0.88}, balanced:{scale:1.35, quality:0.74}, small:{scale:0.95, quality:0.56}, tiny:{scale:0.62, quality:0.42} };
          const pr = presets[mode];
          bytes = await rasterize(file, { scale: pr.scale, quality: pr.quality, format:"jpeg", grayscale:false, onProgress: v=> st.prog(v*0.95) });
        }
        const diff = file.size - bytes.length; const pct = Math.abs(Math.round(diff/file.size*100));
        stats.innerHTML = "";
        [["Original", H.fmtBytes(file.size), ""], ["Compressed", H.fmtBytes(bytes.length), diff>0? "good":(diff<0? "bad":"")],
         [diff>=0? "Saved":"Grew by", (diff>=0? "" : "") + pct + "%", diff>0? "good":""]].forEach(([k,v,cls])=>{
          const c = el("div","stat-card"); c.innerHTML = `<div class="k">${esc(k)}</div><div class="v ${cls}">${esc(v)}</div>`; stats.appendChild(c);
        });
        stats.classList.remove("hidden");
        showOut(); outs.add(H.baseName(file.name)+"_compressed.pdf", bytes);
        st.prog(1); st.ok(diff>0? "Done — saved "+H.fmtBytes(diff)+" ("+pct+"%)." : "Done. This file was already tight, so the result is not smaller — try a stronger level or keep the original.");
      }catch(e){ st.err(e.message||String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= GRAYSCALE ================= */
Onyx.register({ id:"grayscale", name:"Grayscale PDF", icon:"grayscale",
  blurb:"Convert a colour PDF to black & white — cheaper printing, smaller files, cleaner scans.",
  keywords:"grayscale black and white bw monochrome print",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept:".pdf", multiple:false, toolName:"Grayscale PDF", title:"Drop a PDF here" });
    p.appendChild(dz.element);
    p.appendChild(el("p","small","Pages are re-rendered in grayscale, so text becomes part of the page image. Great for print prep and shrinking colour scans."));
    let q = H.setting("grayscale","q","balanced");
    p.appendChild(H.field("Render quality", H.radioRow([
      {value:"high", label:"High"},{value:"balanced", label:"Balanced"},{value:"small", label:"Compact"}
    ], q, v=>{ q=v; H.setSetting("grayscale","q",v); })));
    const { btn, st, outs, showOut } = actionRow(p, "Convert to Grayscale");
    btn.onclick = async ()=>{
      const file = dz.getFiles()[0]; if(!file){ st.err("Choose a PDF first."); return; }
      btn.disabled = true; st.say("Converting…");
      try{
        const presets = { high:{scale:2, quality:0.9}, balanced:{scale:1.4, quality:0.78}, small:{scale:0.95, quality:0.6} };
        const pr = presets[q];
        const bytes = await rasterize(file, { scale: pr.scale, quality: pr.quality, format:"jpeg", grayscale:true, onProgress: v=> st.prog(v) });
        showOut(); outs.add(H.baseName(file.name)+"_grayscale.pdf", bytes, H.fmtBytes(file.size)+" → "+H.fmtBytes(bytes.length));
        st.prog(1); st.ok("Done.");
      }catch(e){ st.err(e.message||String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= PDF → IMAGES ================= */
Onyx.register({ id:"pdf2img", name:"PDF to Images", icon:"pdf2img", tag:"Converter",
  blurb:"Turn every page into a JPG or PNG at the quality you choose — up to print-sharp 300 DPI.",
  keywords:"pdf to jpg png images convert pages pictures export",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept:".pdf", multiple:false, toolName:"PDF to Images", title:"Drop a PDF here" });
    p.appendChild(dz.element);
    let fmt = H.setting("pdf2img","fmt","jpg");
    p.appendChild(H.field("Format", H.radioRow([{value:"jpg",label:"JPG (smaller)"},{value:"png",label:"PNG (lossless)"}], fmt, v=>{ fmt=v; H.setSetting("pdf2img","fmt",v); })));
    let dpi = H.setting("pdf2img","dpi","150");
    p.appendChild(H.field("Resolution", H.radioRow([
      {value:"72",label:"72 DPI · screen"},{value:"150",label:"150 DPI · good"},{value:"200",label:"200 DPI · sharp"},{value:"300",label:"300 DPI · print"}
    ], dpi, v=>{ dpi=v; H.setSetting("pdf2img","dpi",v); })));
    const rangeIn = H.textInput("", "Empty = all pages, or e.g. 1-3, 5");
    p.appendChild(H.field("Pages", rangeIn));
    const whiteBg = H.checkRow("White background (recommended for JPG)", true); p.appendChild(whiteBg.row);
    const { btn, st, outs, showOut } = actionRow(p, "Convert Pages");
    btn.onclick = async ()=>{
      const file = dz.getFiles()[0]; if(!file){ st.err("Choose a PDF first."); return; }
      btn.disabled = true; outs.clear(); st.say("Rendering…");
      try{
        const js = await H.loadPdfJs(file);
        const idx = rangeIn.value.trim()? H.parseRanges(rangeIn.value, js.numPages) : Array.from({length: js.numPages}, (_,i)=> i);
        const scale = (+dpi)/72;
        showOut();
        for(let k=0;k<idx.length;k++){
          const pageNo = idx[k]+1;
          const { canvas } = await H.renderPage(js, pageNo, scale);
          let use = canvas;
          if(fmt === "jpg" && whiteBg.box.checked){
            const c = el("canvas"); c.width = canvas.width; c.height = canvas.height;
            const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0,0,c.width,c.height); g.drawImage(canvas, 0, 0); use = c;
          }
          const bytes = await H.canvasToBytes(use, fmt==="png"? "image/png":"image/jpeg", 0.92);
          outs.add(H.baseName(file.name)+"_page-"+pageNo+"."+fmt, new Blob([bytes], {type: fmt==="png"?"image/png":"image/jpeg"}));
          st.prog((k+1)/idx.length);
        }
        st.ok("Done — "+idx.length+" image"+(idx.length===1?"":"s")+" ready to download.");
      }catch(e){ st.err(e.message||String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= IMAGES → PDF ================= */
Onyx.register({ id:"img2pdf", name:"Images to PDF", icon:"img2pdf", tag:"Converter",
  blurb:"Make a PDF from JPG, PNG or WebP images — you control page size, orientation and margins.",
  keywords:"jpg png webp images photos to pdf convert pictures",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept:"image/jpeg,image/png,image/webp", multiple:true, reorderable:true, toolName:"Images to PDF",
      title:"Drop images here", hint:"Drag the list to set page order. Combine with Scan Enhance first for photographed documents." });
    p.appendChild(dz.element);
    let size = H.setting("img2pdf","size","fit");
    p.appendChild(H.field("Page size", H.radioRow([
      {value:"fit", label:"Fit to image"},{value:"a4", label:"A4"},{value:"letter", label:"Letter"}
    ], size, v=>{ size=v; H.setSetting("img2pdf","size",v); })));
    let orient = H.setting("img2pdf","orient","auto");
    p.appendChild(H.field("Orientation (A4/Letter)", H.radioRow([
      {value:"auto", label:"Auto per image"},{value:"portrait", label:"Portrait"},{value:"landscape", label:"Landscape"}
    ], orient, v=>{ orient=v; H.setSetting("img2pdf","orient",v); })));
    const margin = H.slider(H.setting("img2pdf","margin",18), 0, 72, 1);
    const mVal = el("span","fsize", margin.value+" pt");
    margin.oninput = ()=>{ mVal.textContent = margin.value+" pt"; H.setSetting("img2pdf","margin", +margin.value); };
    const mf = H.field("Margin", margin); mf.appendChild(mVal); p.appendChild(mf);
    const { btn, st, outs, showOut } = actionRow(p, "Create PDF");
    btn.onclick = async ()=>{
      const files = dz.getFiles(); if(!files.length){ st.err("Add at least one image."); return; }
      btn.disabled = true; st.say("Building PDF…");
      try{
        const doc = await PDFDocument.create();
        const SIZES = { a4:[595.28, 841.89], letter:[612, 792] };
        for(let i=0;i<files.length;i++){
          const f = files[i];
          let bytes = await H.fileBytes(f);
          let img, iw, ih;
          const isPng = bytes[0]===0x89 && bytes[1]===0x50;
          const isJpg = bytes[0]===0xFF && bytes[1]===0xD8;
          if(isPng){ img = await doc.embedPng(bytes); }
          else if(isJpg){ img = await doc.embedJpg(bytes); }
          else { const bmp = await createImageBitmap(f); const c = el("canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d").drawImage(bmp,0,0); bytes = await H.canvasToBytes(c, "image/png"); img = await doc.embedPng(bytes); }
          iw = img.width; ih = img.height;
          if(size === "fit"){
            const w = iw * 0.75, h = ih * 0.75, m = +margin.value;
            const page = doc.addPage([w + m*2, h + m*2]);
            page.drawImage(img, { x: m, y: m, width: w, height: h });
          } else {
            let [pw, ph] = SIZES[size];
            const useLand = orient === "landscape" || (orient === "auto" && iw > ih);
            if(useLand) [pw, ph] = [ph, pw];
            const m = +margin.value;
            const availW = pw - m*2, availH = ph - m*2;
            const s = Math.min(availW/iw, availH/ih);
            const w = iw*s, h = ih*s;
            const page = doc.addPage([pw, ph]);
            page.drawImage(img, { x: (pw-w)/2, y: (ph-h)/2, width: w, height: h });
          }
          st.prog((i+1)/files.length);
        }
        showOut(); outs.add("images.pdf", await doc.save({ useObjectStreams: true }), files.length+" images");
        st.ok("Done — "+files.length+" images in one PDF."); 
      }catch(e){ st.err(e.message||String(e)); }
      btn.disabled = false;
    };
  }
});
})();
