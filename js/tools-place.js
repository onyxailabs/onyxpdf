/* OnyxPDF — visual placement tools: Sign PDF, Edit PDF, Annotate, Redact.
   Shared stage: pdf.js renders the page; items are dragged on top; pdf-lib bakes them in. */
(function(){
"use strict";
const H = window.H, { el, esc } = H;
const { StandardFonts, rgb, degrees } = window.PDFLib;

function panel(root){ const p = el("div","panel"); root.appendChild(p); return p; }
function actionRow(parent, label){
  const row = el("div","btn-row"); const btn = el("button","btn", esc(label)); row.appendChild(btn); parent.appendChild(row);
  const st = H.statusBox(parent);
  const outPanel = el("div","panel"); outPanel.classList.add("hidden");
  const outs = H.outputList(); outPanel.appendChild(outs.element); parent.parentNode.appendChild(outPanel);
  return { btn, st, outs, showOut(){ outPanel.classList.remove("hidden"); } };
}
function hexRgb(hex){ const n = parseInt(hex.slice(1), 16); return [((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255]; }

/* ---------- shared page stage ---------- */
function makeStage(root, toolName){
  const p = panel(root);
  const S = { file:null, js:null, lib:null, pageNo:1, scale:1, pt:{w:595,h:842}, base:null };
  const dz = H.dropzone({ accept:".pdf", multiple:false, toolName, title:"Drop a PDF here",
    onChange: async files=>{ S.file = files[0]||null; if(S.file){ try{ S.js = await H.loadPdfJs(S.file); S.pageNo = 1; navInfo.textContent = "of "+S.js.numPages; await S.render(); if(S.onLoad) S.onLoad(); }catch(e){ st.err(e.message||String(e)); } } } });
  p.appendChild(dz.element);
  const nav = el("div","btn-row");
  const prev = el("button","btn ghost sm","← Prev"); const next = el("button","btn ghost sm","Next →");
  const navInfo = el("span","small","");
  nav.append(prev, next, navInfo); p.appendChild(nav);
  const wrap = el("div","stage-wrap");
  const holder = el("div","sig-overlay-wrap");
  const base = el("canvas"); holder.appendChild(base); wrap.appendChild(holder); p.appendChild(wrap);
  const st = H.statusBox(p);
  S.holder = holder; S.baseCanvas = base; S.st = st; S.panel = p;
  S.render = async function(){
    if(!S.js) return;
    const page = await S.js.getPage(S.pageNo);
    const vp1 = page.getViewport({ scale: 1 }); S.pt = { w: vp1.width, h: vp1.height };
    S.scale = Math.min(860 / vp1.width, 1.5);
    const { canvas } = await H.renderPage(S.js, S.pageNo, S.scale);
    base.width = canvas.width; base.height = canvas.height;
    base.getContext("2d").drawImage(canvas, 0, 0);
    holder.style.width = canvas.width+"px"; holder.style.height = canvas.height+"px";
    navInfo.textContent = "Page "+S.pageNo+" of "+S.js.numPages;
    if(S.onRender) S.onRender();
  };
  prev.onclick = ()=>{ if(S.pageNo > 1){ S.pageNo--; S.render(); } };
  next.onclick = ()=>{ if(S.js && S.pageNo < S.js.numPages){ S.pageNo++; S.render(); } };
  // coordinate helpers (px are canvas pixels; holder is 1:1 with canvas)
  S.toPt = (x, y)=> [x / S.scale, S.pt.h - y / S.scale];
  S.fromPt = (xPt, yPt)=> [xPt * S.scale, (S.pt.h - yPt) * S.scale];
  /* draggable box inside holder */
  S.makeBox = function(contentEl, x, y, w){
    const box = el("div","sig-box"); box.style.left = x+"px"; box.style.top = y+"px"; box.style.width = w+"px";
    if(contentEl) box.appendChild(contentEl);
    const rsz = el("div","rsz"); box.appendChild(rsz); holder.appendChild(box);
    let drag = null;
    box.addEventListener("pointerdown", e=>{
      if(e.target === rsz) return;
      drag = { dx: e.clientX - box.offsetLeft, dy: e.clientY - box.offsetTop };
      box.setPointerCapture(e.pointerId);
    });
    box.addEventListener("pointermove", e=>{
      if(!drag) return;
      box.style.left = Math.max(-10, Math.min(holder.clientWidth - 20, e.clientX - drag.dx)) + "px";
      box.style.top = Math.max(-10, Math.min(holder.clientHeight - 14, e.clientY - drag.dy)) + "px";
    });
    box.addEventListener("pointerup", ()=> drag = null);
    let rz = null;
    rsz.addEventListener("pointerdown", e=>{ e.stopPropagation(); rz = { x: e.clientX, w: box.offsetWidth, h: box.offsetHeight }; rsz.setPointerCapture(e.pointerId); });
    rsz.addEventListener("pointermove", e=>{ if(!rz) return; const nw = Math.max(24, rz.w + (e.clientX - rz.x)); box.style.width = nw + "px"; if(box.dataset.lockH) box.style.height = (nw / (+box.dataset.lockH)) + "px"; });
    rsz.addEventListener("pointerup", ()=> rz = null);
    box.getRectPx = ()=> ({ x: box.offsetLeft, y: box.offsetTop, w: box.offsetWidth, h: box.offsetHeight });
    box.getRectPt = ()=>{ const r = box.getRectPx(); return { x: r.x / S.scale, y: S.pt.h - (r.y + r.h) / S.scale, w: r.w / S.scale, h: r.h / S.scale }; };
    return box;
  };
  return S;
}

/* ================= SIGN PDF ================= */
Onyx.register({ id:"sign", name:"Sign PDF", icon:"sign", tag:"Free here · paid elsewhere",
  blurb:"Draw or type your signature, drop it exactly where it belongs, and bake it into the PDF. No account, no “e-sign” paywall.",
  keywords:"sign signature draw name sign document contract esign",
  mount(root){
    const S = makeStage(root, "Sign PDF");
    const controls = el("div","panel");
    const rowBtns = el("div","btn-row");
    const drawBtn = el("button","btn ghost","✎ Draw signature");
    const typeIn = H.textInput("", "…or type your name"); typeIn.style.maxWidth = "240px";
    const typeBtn = el("button","btn ghost","Create from text");
    const clearBtn = el("button","btn ghost","Remove signature");
    rowBtns.append(drawBtn, typeIn, typeBtn, clearBtn); controls.appendChild(rowBtns);
    const allPages = H.checkRow("Place this signature on every page (same spot)", false); controls.appendChild(allPages.row);
    controls.appendChild(el("p","small","Drag the signature to position it; use the round handle in its corner to resize. Your signature image is created and stored only in this browser tab."));
    root.appendChild(controls);
    const { btn, st, outs, showOut } = actionRow(controls, "Bake Signature into PDF");
    /* signature pad modal */
    const veil = el("div","modal-veil");
    veil.innerHTML = `<div class="modal"><h3>Draw your signature</h3></div>`;
    const modal = veil.firstChild;
    const pad = el("canvas","pad"); pad.width = 560; pad.height = 220; modal.appendChild(pad);
    const mRow = el("div","btn-row");
    const mClear = el("button","btn ghost sm","Clear"); const mUse = el("button","btn sm","Use signature"); const mCancel = el("button","btn ghost sm","Cancel");
    mRow.append(mClear, mUse, mCancel); modal.appendChild(mRow); root.appendChild(veil);
    const pg = pad.getContext("2d"); pg.lineWidth = 2.6; pg.lineCap = "round"; pg.strokeStyle = "#12263f";
    let drawing = false, last = null;
    const padPos = e=>{ const r = pad.getBoundingClientRect(); return { x: (e.clientX - r.left) * (pad.width / r.width), y: (e.clientY - r.top) * (pad.height / r.height) }; };
    pad.addEventListener("pointerdown", e=>{ drawing = true; last = padPos(e); pad.setPointerCapture(e.pointerId); });
    pad.addEventListener("pointermove", e=>{ if(!drawing) return; const q = padPos(e); pg.beginPath(); pg.moveTo(last.x, last.y); pg.lineTo(q.x, q.y); pg.stroke(); last = q; });
    pad.addEventListener("pointerup", ()=> drawing = false);
    mClear.onclick = ()=> pg.clearRect(0, 0, pad.width, pad.height);
    mCancel.onclick = ()=> veil.classList.remove("on");
    drawBtn.onclick = ()=> veil.classList.add("on");
    let sigBytes = null, sigBox = null, sigAspect = 2.5;
    async function useSignatureCanvas(srcCanvas){
      sigBytes = await H.canvasToBytes(srcCanvas, "image/png");
      sigAspect = srcCanvas.width / srcCanvas.height;
      placeSignature();
    }
    function placeSignature(){
      if(sigBox){ sigBox.remove(); sigBox = null; }
      if(!S.js){ st.say("Choose a PDF first — the signature will appear here once the document is loaded."); return; }
      const url = URL.createObjectURL(new Blob([sigBytes], {type:"image/png"}));
      const img = el("img"); img.src = url; img.alt = "Your signature"; img.draggable = false;
      const w = Math.min(S.baseCanvas.width * 0.38, 260);
      sigBox = S.makeBox(img, (S.baseCanvas.width - w)/2, S.baseCanvas.height - w/sigAspect - 40, w);
      img.style.height = "100%";
      sigBox.dataset.lockH = sigAspect; sigBox.style.height = (w / sigAspect) + "px";
      st.say("Signature placed on page "+S.pageNo+". Drag / resize it, then bake it in.");
    }
    mUse.onclick = async ()=>{ veil.classList.remove("on"); await useSignatureCanvas(pad); };
    typeBtn.onclick = async ()=>{
      const name = typeIn.value.trim(); if(!name){ st.err("Type your name first."); return; }
      const c = el("canvas"); const g = c.getContext("2d");
      const fontSpec = size => `italic 600 ${size}px "Segoe Script","Brush Script MT","Snell Roundhand",cursive`;
      g.font = fontSpec(72); const w = Math.ceil(g.measureText(name).width) + 30;
      c.width = w; c.height = 110;
      const g2 = c.getContext("2d"); g2.font = fontSpec(72); g2.fillStyle = "#12263f"; g2.textBaseline = "middle"; g2.fillText(name, 15, 60);
      await useSignatureCanvas(c);
    };
    clearBtn.onclick = ()=>{ if(sigBox){ sigBox.remove(); sigBox = null; } sigBytes = null; };
    S.onLoad = ()=>{ if(sigBytes) placeSignature(); };
    S.onRender = ()=>{ if(sigBox && sigBytes) placeSignature(); };
    btn.onclick = async ()=>{
      if(!S.file){ st.err("Choose a PDF first."); return; }
      if(!sigBytes || !sigBox){ st.err("Create a signature and place it first."); return; }
      btn.disabled = true; st.say("Baking signature in…");
      try{
        const doc = await H.loadPdf(S.file);
        const img = await doc.embedPng(sigBytes);
        const rect = sigBox.getRectPt();
        const pages = allPages.box.checked? doc.getPages() : [doc.getPage(S.pageNo - 1)];
        pages.forEach(pg2=> pg2.drawImage(img, { x: rect.x, y: rect.y, width: rect.w, height: rect.h }));
        showOut(); outs.add(H.baseName(S.file.name)+"_signed.pdf", await doc.save({ useObjectStreams: true }), allPages.box.checked? "all pages" : "page "+S.pageNo);
        st.ok("Done — signature baked into the PDF.");
      }catch(e){ st.err(e.message||String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= EDIT PDF (add content) ================= */
Onyx.register({ id:"edit", name:"Edit PDF (Add Content)", icon:"edit", tag:"Visual editor",
  blurb:"Add text, images, shapes and whiteout boxes onto any page, exactly where you drag them. (For changing existing text, whiteout + retype — we won't pretend otherwise.)",
  keywords:"edit add text image shape whiteout cover type on pdf modify",
  mount(root){
    const S = makeStage(root, "Edit PDF");
    const controls = el("div","panel");
    const addRow = el("div","btn-row");
    const addText = el("button","btn ghost sm","+ Add text");
    const addImg = el("button","btn ghost sm","+ Add image");
    const addRect = el("button","btn ghost sm","+ Add shape");
    const addWhite = el("button","btn ghost sm","+ Whiteout box");
    addRow.append(addText, addImg, addRect, addWhite); controls.appendChild(addRow);
    const imgFile = el("input"); imgFile.type = "file"; imgFile.accept = "image/png,image/jpeg,image/webp"; imgFile.className = "hidden"; controls.appendChild(imgFile);
    const itemsList = el("div","out-list"); controls.appendChild(itemsList);
    controls.appendChild(el("p","small","Items are placed on the page you're viewing. Switch pages to add items there too — the list shows everything that will be baked in."));
    root.appendChild(controls);
    const { btn, st, outs, showOut } = actionRow(controls, "Bake Changes into PDF");
    const items = []; // {kind, page, box, data, scale, ptH}
    function rectOf(it){ const b = it.box; return { x: b.offsetLeft / it.scale, y: it.ptH - (b.offsetTop + b.offsetHeight) / it.scale, w: b.offsetWidth / it.scale, h: b.offsetHeight / it.scale }; }
    function refreshList(){
      itemsList.innerHTML = "";
      items.forEach((it, i)=>{
        const row = el("div","out-item");
        row.innerHTML = `<span class="fname">${esc(it.label)} · page ${it.page}</span>`;
        const del = el("button","dl-btn","Remove"); del.onclick = ()=>{ it.box.remove(); items.splice(i, 1); refreshList(); };
        row.appendChild(del); itemsList.appendChild(row);
      });
    }
    function registerItem(kind, label, boxEl, data){ const it = { kind, label, page: S.pageNo, box: boxEl, data, scale: S.scale, ptH: S.pt.h }; items.push(it); refreshList(); return it; }
    S.onRender = ()=>{ items.forEach(it=>{ it.box.style.display = it.page === S.pageNo? "" : "none"; }); };
    addText.onclick = ()=>{
      if(!S.js){ st.err("Load a PDF first."); return; }
      const text = prompt("Text to add:", "Type here"); if(text == null) return;
      const sizePt = Math.max(8, Math.min(72, +prompt("Text size (pt):", "14") || 14));
      const content = el("div"); content.textContent = text;
      content.style.cssText = `font:${sizePt * S.scale}px Helvetica,Arial,sans-serif;color:#111;background:rgba(255,255,255,.65);padding:1px 4px;white-space:nowrap;line-height:1.25`;
      const w = Math.max(60, (text.length * sizePt * 0.55 + 14) * S.scale);
      const box = S.makeBox(content, 60, 60, Math.min(w, S.baseCanvas.width - 40));
      box.style.height = (sizePt * 1.4 * S.scale) + "px";
      registerItem("text", "Text “"+text.slice(0, 22)+"”", box, { text, sizePt, color: "#111111", bold: false });
    };
    imgFile.onchange = async ()=>{
      const f = imgFile.files[0]; if(!f) return; imgFile.value = "";
      if(!S.js){ st.err("Load a PDF first."); return; }
      let bytes = await H.fileBytes(f);
      const isPng = bytes[0]===0x89 && bytes[1]===0x50, isJpg = bytes[0]===0xFF && bytes[1]===0xD8;
      if(!isPng && !isJpg){ const bmp = await createImageBitmap(f); const c = el("canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d").drawImage(bmp, 0, 0); bytes = await H.canvasToBytes(c, "image/png"); }
      const bmp = await createImageBitmap(new Blob([bytes]));
      const url = URL.createObjectURL(new Blob([bytes]));
      const img = el("img"); img.src = url; img.draggable = false; img.style.height = "100%";
      const w = Math.min(S.baseCanvas.width * 0.4, 240);
      const box = S.makeBox(img, 70, 90, w);
      box.dataset.lockH = bmp.width / bmp.height; box.style.height = (w / (bmp.width / bmp.height)) + "px";
      registerItem("image", "Image "+f.name, box, { bytes });
    };
    addImg.onclick = ()=> imgFile.click();
    function addShape(kind){
      if(!S.js){ st.err("Load a PDF first."); return; }
      const content = el("div");
      const isWhite = kind === "whiteout";
      content.style.cssText = `width:100%;height:100%;background:${isWhite? "#ffffff" : "rgba(34,211,238,.45)"};border:${isWhite? "1px solid #ccc" : "1.5px solid #0ea5c6"}`;
      const box = S.makeBox(content, 80, 110, 170); box.style.height = "90px"; box.style.border = "none"; box.style.background = "transparent";
      registerItem(kind, isWhite? "Whiteout box (visual cover)" : "Rectangle shape", box, { color: isWhite? "#ffffff" : "#22d3ee", opacity: isWhite? 1 : 0.45 });
    }
    addRect.onclick = ()=> addShape("rect");
    addWhite.onclick = ()=> addShape("whiteout");
    btn.onclick = async ()=>{
      if(!S.file){ st.err("Choose a PDF first."); return; }
      if(!items.length){ st.err("Add at least one item first."); return; }
      btn.disabled = true; st.say("Baking…");
      try{
        const doc = await H.loadPdf(S.file);
        const font = await doc.embedFont(StandardFonts.Helvetica);
        for(const it of items){
          const page = doc.getPage(it.page - 1);
          const r = rectOf(it);
          if(it.kind === "text"){
            page.drawText(H.safeWinAnsi(it.data.text), { x: r.x, y: r.y + it.data.sizePt * 0.24, size: it.data.sizePt, font, color: rgb(...hexRgb(it.data.color)) });
          } else if(it.kind === "image"){
            const isPng = it.data.bytes[0]===0x89 && it.data.bytes[1]===0x50;
            const img = isPng? await doc.embedPng(it.data.bytes) : await doc.embedJpg(it.data.bytes);
            page.drawImage(img, { x: r.x, y: r.y, width: r.w, height: r.h });
          } else {
            page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: rgb(...hexRgb(it.data.color)), opacity: it.data.opacity });
          }
        }
        showOut(); outs.add(H.baseName(S.file.name)+"_edited.pdf", await doc.save({ useObjectStreams: true }), items.length+" items added");
        st.ok("Done. Whiteout boxes cover visually — for permanent removal of sensitive content use the Redact tool.");
      }catch(e){ st.err(e.message||String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= ANNOTATE ================= */
Onyx.register({ id:"annotate", name:"Annotate & Highlight", icon:"annotate",
  blurb:"Highlight passages with translucent colour, draw freehand, and add note labels — then bake it all in.",
  keywords:"annotate highlight draw markup comment review pen marker",
  mount(root){
    const S = makeStage(root, "Annotate & Highlight");
    const controls = el("div","panel");
    let mode = "highlight";
    controls.appendChild(H.field("Tool", H.radioRow([
      {value:"highlight", label:"▬ Highlight"},{value:"draw", label:"✎ Freehand draw"},{value:"note", label:"▸ Note label"}
    ], mode, v=>{ mode = v; drawLayer.style.pointerEvents = v==="draw"? "auto":"none"; S.holder.style.cursor = v==="highlight"? "crosshair":"default"; })));
    const colorIn = el("input"); colorIn.type = "color"; colorIn.value = "#ffe135"; colorIn.style.cssText = "width:52px;height:34px;border:1px solid var(--border);border-radius:8px;background:var(--input)";
    controls.appendChild(H.field("Colour (highlight / pen)", colorIn));
    const clearBtn = el("button","btn ghost sm","Clear this page's marks"); controls.appendChild(clearBtn);
    controls.appendChild(el("p","small","Highlight: drag a box over the text. Draw: scribble directly on the page. Note: click “+ Note” then type — drag it into place."));
    const noteBtn = el("button","btn ghost sm","+ Note label"); controls.appendChild(noteBtn);
    root.appendChild(controls);
    const { btn, st, outs, showOut } = actionRow(controls, "Bake Annotations into PDF");
    /* per-page marks: {hl:[{x,y,w,h,color}], notes:[item], strokes: dataURL, scale, ptW, ptH} */
    const marks = new Map();
    const pageMarks = ()=>{ if(!marks.has(S.pageNo)) marks.set(S.pageNo, { hl: [], notes: [], strokes: null, scale: S.scale, ptW: S.pt.w, ptH: S.pt.h }); return marks.get(S.pageNo); };
    /* highlight dragging on holder */
    let hlStart = null, hlGhost = null;
    S.holder.addEventListener("pointerdown", e=>{
      if(mode !== "highlight" || !S.js || e.target !== S.baseCanvas) return;
      const r = S.holder.getBoundingClientRect();
      hlStart = { x: e.clientX - r.left, y: e.clientY - r.top };
      hlGhost = el("div"); hlGhost.style.cssText = "position:absolute;border:1.5px dashed var(--accent);background:rgba(255,225,53,.25);pointer-events:none";
      S.holder.appendChild(hlGhost);
    });
    S.holder.addEventListener("pointermove", e=>{
      if(!hlStart || !hlGhost) return;
      const r = S.holder.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      hlGhost.style.left = Math.min(hlStart.x, x)+"px"; hlGhost.style.top = Math.min(hlStart.y, y)+"px";
      hlGhost.style.width = Math.abs(x - hlStart.x)+"px"; hlGhost.style.height = Math.abs(y - hlStart.y)+"px";
    });
    S.holder.addEventListener("pointerup", e=>{
      if(!hlStart) return;
      const r = S.holder.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const rect = { x: Math.min(hlStart.x, x), y: Math.min(hlStart.y, y), w: Math.abs(x - hlStart.x), h: Math.abs(y - hlStart.y) };
      if(hlGhost) hlGhost.remove(); hlGhost = null; hlStart = null;
      if(rect.w < 6 || rect.h < 4) return;
      pageMarks().hl.push({ ...rect, color: colorIn.value });
      paintMarks();
    });
    /* draw layer */
    const drawLayer = el("canvas"); drawLayer.style.cssText = "position:absolute;left:0;top:0;pointer-events:none";
    S.holder.appendChild(drawLayer);
    let pen = null;
    drawLayer.addEventListener("pointerdown", e=>{ const r = drawLayer.getBoundingClientRect(); pen = { x: e.clientX - r.left, y: e.clientY - r.top }; drawLayer.setPointerCapture(e.pointerId); });
    drawLayer.addEventListener("pointermove", e=>{ if(!pen) return; const r = drawLayer.getBoundingClientRect(); const q = { x: e.clientX - r.left, y: e.clientY - r.top };
      const g = drawLayer.getContext("2d"); g.strokeStyle = colorIn.value; g.lineWidth = 2.4; g.lineCap = "round"; g.beginPath(); g.moveTo(pen.x, pen.y); g.lineTo(q.x, q.y); g.stroke(); pen = q; });
    drawLayer.addEventListener("pointerup", ()=>{ pen = null; pageMarks().strokes = drawLayer.toDataURL("image/png"); });
    function clearLayer(){ const g = drawLayer.getContext("2d"); g.clearRect(0, 0, drawLayer.width, drawLayer.height); }
    function paintMarks(){
      const m = pageMarks();
      // repaint highlight boxes as translucent divs (visual only) + restore strokes
      H.$$(".hl-box", S.holder).forEach(n=> n.remove());
      m.hl.forEach(h=>{
        const d = el("div","hl-box"); d.style.cssText = `position:absolute;left:${h.x}px;top:${h.y}px;width:${h.w}px;height:${h.h}px;background:${h.color};opacity:.38;pointer-events:none`;
        S.holder.appendChild(d);
      });
      clearLayer();
      if(m.strokes){ const img = new Image(); img.onload = ()=> drawLayer.getContext("2d").drawImage(img, 0, 0); img.src = m.strokes; }
      m.notes.forEach(n=>{ n.box.style.display = ""; });
    }
    S.onRender = ()=>{
      drawLayer.width = S.baseCanvas.width; drawLayer.height = S.baseCanvas.height;
      drawLayer.style.width = S.baseCanvas.width+"px"; drawLayer.style.height = S.baseCanvas.height+"px";
      // notes boxes belong to pages; toggle visibility
      marks.forEach((m, pn)=> m.notes.forEach(n=>{ n.box.style.display = pn === S.pageNo? "" : "none"; }));
      paintMarks();
    };
    noteBtn.onclick = ()=>{
      if(!S.js){ st.err("Load a PDF first."); return; }
      const text = prompt("Note text:", "Note"); if(text == null) return;
      const content = el("div"); content.textContent = "▸ " + text;
      content.style.cssText = "background:#fff3a6;color:#4a3b00;font:600 12.5px Helvetica,Arial,sans-serif;padding:3px 7px;border-radius:4px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.25)";
      const box = S.makeBox(content, 50, 50, Math.min(60 + text.length * 7.5, 420));
      box.style.height = "26px"; box.style.border = "none"; box.style.background = "transparent";
      pageMarks().notes.push({ box, text, sizePt: 10 });
      paintMarks();
    };
    clearBtn.onclick = ()=>{ const m = pageMarks(); m.hl = []; m.strokes = null; m.notes.forEach(n=> n.box.remove()); m.notes = []; paintMarks(); };
    btn.onclick = async ()=>{
      if(!S.file){ st.err("Choose a PDF first."); return; }
      const total = [...marks.values()].reduce((s, m)=> s + m.hl.length + m.notes.length + (m.strokes? 1:0), 0);
      if(!total){ st.err("Nothing marked yet — highlight, draw or add a note first."); return; }
      btn.disabled = true; st.say("Baking…");
      try{
        const doc = await H.loadPdf(S.file);
        const font = await doc.embedFont(StandardFonts.HelveticaBold);
        for(const [pn, m] of marks.entries()){
          const page = doc.getPage(pn - 1);
          const sc = m.scale || S.scale, pth = m.ptH || S.pt.h, ptw = m.ptW || S.pt.w;
          m.hl.forEach(h=>{
            const r = { x: h.x / sc, y: pth - (h.y + h.h) / sc, w: h.w / sc, h: h.h / sc };
            page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: rgb(...hexRgb(h.color)), opacity: 0.38 });
          });
          for(const n of m.notes){
            const b = n.box;
            const r = { x: b.offsetLeft / sc, y: pth - (b.offsetTop + b.offsetHeight) / sc, w: b.offsetWidth / sc, h: b.offsetHeight / sc };
            page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: rgb(1, 0.95, 0.65) });
            page.drawText(H.safeWinAnsi(n.text), { x: r.x + 5, y: r.y + r.h * 0.32, size: n.sizePt, font, color: rgb(0.29, 0.23, 0) });
          }
          if(m.strokes){
            const bytes = await (await fetch(m.strokes)).arrayBuffer();
            const img = await doc.embedPng(new Uint8Array(bytes));
            page.drawImage(img, { x: 0, y: 0, width: ptw, height: pth });
          }
        }
        showOut(); outs.add(H.baseName(S.file.name)+"_annotated.pdf", await doc.save({ useObjectStreams: true }), total+" marks");
        st.ok("Done.");
      }catch(e){ st.err(e.message||String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= REDACT ================= */
Onyx.register({ id:"redact", name:"Redact PDF (True Removal)", icon:"redact", tag:"Free here · paid elsewhere",
  blurb:"Black out sensitive content so it's actually gone — marked pages are re-rendered as images, so the hidden text can't be copied back out.",
  keywords:"redact blackout remove sensitive censor hide permanently delete content",
  mount(root){
    const S = makeStage(root, "Redact PDF");
    const controls = el("div","panel");
    controls.appendChild(el("p","small","Drag black boxes over anything sensitive — names, account numbers, addresses. When you apply, every marked page is rebuilt as a flat image with the boxes burned in: the text underneath no longer exists in the file. Unmarked pages stay untouched (and keep their live text)."));
    const clearBtn = el("button","btn ghost sm","Clear this page's boxes"); controls.appendChild(clearBtn);
    const count = el("div","small mt"); controls.appendChild(count);
    root.appendChild(controls);
    const { btn, st, outs, showOut } = actionRow(controls, "Apply Redaction");
    const marks = new Map(); // pageNo -> [{x,y,w,h}] in canvas px at that page's render scale
    const scales = new Map();
    const pageMarks = ()=>{ if(!marks.has(S.pageNo)) marks.set(S.pageNo, []); return marks.get(S.pageNo); };
    let start = null, ghost = null;
    S.holder.addEventListener("pointerdown", e=>{
      if(!S.js || e.target !== S.baseCanvas) return;
      const r = S.holder.getBoundingClientRect();
      start = { x: e.clientX - r.left, y: e.clientY - r.top };
      ghost = el("div"); ghost.style.cssText = "position:absolute;background:rgba(0,0,0,.85);border:1px solid #f87171;pointer-events:none";
      S.holder.appendChild(ghost);
    });
    S.holder.addEventListener("pointermove", e=>{
      if(!start || !ghost) return;
      const r = S.holder.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      ghost.style.left = Math.min(start.x, x)+"px"; ghost.style.top = Math.min(start.y, y)+"px";
      ghost.style.width = Math.abs(x - start.x)+"px"; ghost.style.height = Math.abs(y - start.y)+"px";
    });
    S.holder.addEventListener("pointerup", e=>{
      if(!start) return;
      const r = S.holder.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const rect = { x: Math.min(start.x, x), y: Math.min(start.y, y), w: Math.abs(x - start.x), h: Math.abs(y - start.y) };
      ghost.remove(); ghost = null; start = null;
      if(rect.w < 5 || rect.h < 5) return;
      pageMarks().push(rect); scales.set(S.pageNo, S.scale);
      paint(); updateCount();
    });
    function paint(){
      H.$$(".rd-box", S.holder).forEach(n=> n.remove());
      (marks.get(S.pageNo) || []).forEach(m=>{
        const d = el("div","rd-box"); d.style.cssText = `position:absolute;left:${m.x}px;top:${m.y}px;width:${m.w}px;height:${m.h}px;background:#000;pointer-events:none`;
        S.holder.appendChild(d);
      });
    }
    function updateCount(){ const n = [...marks.values()].reduce((s, a)=> s + a.length, 0); count.textContent = n? n+" redaction box"+(n===1?"":"es")+" across "+marks.size+" page(s)." : "No boxes yet."; }
    S.onRender = ()=> paint();
    clearBtn.onclick = ()=>{ marks.set(S.pageNo, []); paint(); updateCount(); };
    btn.onclick = async ()=>{
      if(!S.file){ st.err("Choose a PDF first."); return; }
      const markedPages = [...marks.entries()].filter(([, a])=> a.length);
      if(!markedPages.length){ st.err("Draw at least one black box first."); return; }
      btn.disabled = true; st.say("Applying true redaction…");
      try{
        const src = await H.loadPdf(S.file);
        const js = S.js;
        const out = await window.PDFLib.PDFDocument.create();
        for(let i=1;i<=js.numPages;i++){
          const boxes = marks.get(i);
          const sp = src.getPage(i - 1); const { width: w, height: h } = sp.getSize();
          if(!boxes || !boxes.length){
            const [pg] = await out.copyPages(src, [i - 1]); out.addPage(pg); continue;
          }
          const RS = 2.2; // redaction render scale
          const { canvas } = await H.renderPage(js, i, RS);
          const g = canvas.getContext("2d"); g.fillStyle = "#000";
          const ratio = RS / (scales.get(i) || S.scale);
          boxes.forEach(b=> g.fillRect(b.x * ratio, b.y * ratio, b.w * ratio, b.h * ratio));
          const bytes = await H.canvasToBytes(canvas, "image/jpeg", 0.92);
          const img = await out.embedJpg(bytes);
          const pg = out.addPage([w, h]);
          pg.drawImage(img, { x: 0, y: 0, width: w, height: h });
          st.prog(i / js.numPages);
        }
        showOut(); outs.add(H.baseName(S.file.name)+"_redacted.pdf", await out.save({ useObjectStreams: true }), markedPages.length+" pages rebuilt");
        st.prog(1); st.ok("Done — the marked content is permanently removed from those pages.");
      }catch(e){ st.err(e.message||String(e)); }
      btn.disabled = false;
    };
  }
});
})();
