/* OnyxPDF — interactive tools: Crop, Resize Pages, N-up, Fill Forms. */
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

/* ================= CROP ================= */
Onyx.register({ id:"crop", name:"Crop Pages", icon:"crop",
  blurb:"Trim margins or cut a page down to the part that matters — drag a box on the page, or type exact margins.",
  keywords:"crop trim margins cut page area",
  mount(root){
    const p = panel(root);
    let file = null, js = null, pageNo = 1, scale = 1, sel = null, pageSizePt = { w: 595, h: 842 }, baseCanvas = null;
    const dz = H.dropzone({ accept:".pdf", multiple:false, toolName:"Crop Pages", title:"Drop a PDF here",
      onChange: async files=>{ file = files[0]||null; if(file){ js = await H.loadPdfJs(file); pageNo = 1; pageSel.max = js.numPages; pageSel.value = 1; pageInfo.textContent = "of "+js.numPages; await drawPage(); } } });
    p.appendChild(dz.element);
    let mode = "visual";
    p.appendChild(H.field("Crop method", H.radioRow([{value:"visual",label:"Drag a box on the page"},{value:"margins",label:"Exact margins (points)"}], mode, v=>{ mode=v; visualBox.classList.toggle("hidden", v!=="visual"); marginBox.classList.toggle("hidden", v!=="margins"); })));
    const visualBox = el("div");
    const pageRow = el("div","btn-row");
    const pageSel = H.numInput(1, 1, 1); pageSel.style.width = "90px";
    const pageInfo = el("span","small","");
    const prevB = el("button","btn ghost sm","← Prev"); const nextB = el("button","btn ghost sm","Next →");
    pageRow.append(el("span","small","Page"), pageSel, pageInfo, prevB, nextB);
    visualBox.appendChild(pageRow);
    const stage = el("div","stage-wrap mt"); stage.style.cursor = "crosshair";
    const cv = el("canvas"); stage.appendChild(cv); visualBox.appendChild(stage);
    const selInfo = el("div","small mt","Drag on the page to select the area to KEEP."); visualBox.appendChild(selInfo);
    const applyAll = H.checkRow("Apply the same crop (proportionally) to every page", true); visualBox.appendChild(applyAll.box.parentNode);
    p.appendChild(visualBox);
    const marginBox = el("div","hidden");
    const mT = H.numInput(0, 0, 2000), mB = H.numInput(0, 0, 2000), mL = H.numInput(0, 0, 2000), mR = H.numInput(0, 0, 2000);
    const mg = el("div","cols"); mg.style.gridTemplateColumns = "1fr 1fr";
    const mc1 = el("div"), mc2 = el("div");
    mc1.append(H.field("Trim from top (pt)", mT), H.field("Trim from bottom (pt)", mB));
    mc2.append(H.field("Trim from left (pt)", mL), H.field("Trim from right (pt)", mR));
    mg.append(mc1, mc2); marginBox.appendChild(mg); p.appendChild(marginBox);
    const { btn, st, outs, showOut } = actionRow(p, "Crop & Save");
    async function drawPage(){
      if(!js) return;
      const page = await js.getPage(pageNo);
      const vp1 = page.getViewport({ scale: 1 }); pageSizePt = { w: vp1.width, h: vp1.height };
      scale = Math.min(880 / vp1.width, 1.6);
      const { canvas } = await H.renderPage(js, pageNo, scale);
      baseCanvas = canvas;   // cache the render — selection painting reuses it and must never re-render
      cv.width = canvas.width; cv.height = canvas.height;
      cv.getContext("2d").drawImage(canvas, 0, 0); sel = null;   // page/file changed → old selection no longer applies
      selInfo.textContent = "Drag on the page to select the area to KEEP.";
    }
    // Paint the cached page + (optional) selection overlay, synchronously. Never modifies sel.
    // (The old redrawSel() re-ran the async pdf.js render, whose completion set sel = null —
    //  wiping every finished drag's selection before the user could click "Crop & Save".)
    function paintSel(final){
      const g = cv.getContext("2d");
      if(baseCanvas) g.drawImage(baseCanvas, 0, 0);
      if(!sel) return;
      if(final){
        g.fillStyle = "rgba(0,0,0,.45)";
        g.fillRect(0, 0, cv.width, sel.y); g.fillRect(0, sel.y + sel.h, cv.width, cv.height - sel.y - sel.h);
        g.fillRect(0, sel.y, sel.x, sel.h); g.fillRect(sel.x + sel.w, sel.y, cv.width - sel.x - sel.w, sel.h);
      }
      g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent") || "#22d3ee";
      g.lineWidth = 2; if(!final) g.setLineDash([6, 4]);
      g.strokeRect(sel.x, sel.y, sel.w, sel.h); g.setLineDash([]);
    }
    let dragStart = null;
    const posIn = e=>{ const r = cv.getBoundingClientRect(); return { x: Math.max(0, Math.min(cv.width, (e.clientX - r.left) * (cv.width / r.width))), y: Math.max(0, Math.min(cv.height, (e.clientY - r.top) * (cv.height / r.height))) }; };
    cv.addEventListener("pointerdown", e=>{ if(!js || !baseCanvas) return; dragStart = posIn(e); sel = null; try{ cv.setPointerCapture(e.pointerId); }catch(_){ } });
    cv.addEventListener("pointermove", e=>{ if(!dragStart) return; const q = posIn(e); sel = { x: Math.min(dragStart.x, q.x), y: Math.min(dragStart.y, q.y), w: Math.abs(q.x - dragStart.x), h: Math.abs(q.y - dragStart.y) }; paintSel(false); });
    function endDrag(){
      if(!dragStart) return; dragStart = null;
      if(sel && sel.w >= 4 && sel.h >= 4){ selInfo.textContent = "Selected area: "+Math.round(sel.w/scale)+" × "+Math.round(sel.h/scale)+" pt. Click “Crop & Save”."; paintSel(true); }
      else { sel = null; paintSel(false); selInfo.textContent = "Drag on the page to select the area to KEEP."; }
    }
    cv.addEventListener("pointerup", endDrag);
    cv.addEventListener("pointercancel", endDrag);
    pageSel.onchange = ()=>{ pageNo = Math.max(1, Math.min(js? js.numPages:1, +pageSel.value||1)); drawPage(); };
    prevB.onclick = ()=>{ if(pageNo > 1){ pageNo--; pageSel.value = pageNo; drawPage(); } };
    nextB.onclick = ()=>{ if(js && pageNo < js.numPages){ pageNo++; pageSel.value = pageNo; drawPage(); } };
    btn.onclick = async ()=>{
      if(!file){ st.err("Choose a PDF first."); return; }
      btn.disabled = true; st.say("Cropping…");
      try{
        const doc = await H.loadPdf(file);
        if(mode === "margins"){
          const t = +mT.value||0, b = +mB.value||0, l = +mL.value||0, r = +mR.value||0;
          doc.getPages().forEach(pg=>{ const { width:w, height:h } = pg.getSize();
            if(l + r >= w || t + b >= h) throw new Error("Those margins would remove the whole page.");
            pg.setCropBox(l, b, w - l - r, h - t - b); pg.setMediaBox(l, b, w - l - r, h - t - b); });
        } else {
          if(!sel) throw new Error("Drag a box on the page first to choose the area to keep.");
          const fx = sel.x / cv.width, fw = sel.w / cv.width;
          const fTop = sel.y / cv.height, fh = sel.h / cv.height;
          const apply = pg=>{
            const { width:w, height:h } = pg.getSize();
            const x = fx * w, y = (1 - fTop - fh) * h, cw = fw * w, ch = fh * h;
            pg.setCropBox(x, y, cw, ch); pg.setMediaBox(x, y, cw, ch);
          };
          if(applyAll.box.checked) doc.getPages().forEach(apply); else apply(doc.getPage(pageNo - 1));
        }
        showOut(); outs.add(H.baseName(file.name)+"_cropped.pdf", await doc.save({ useObjectStreams: true }));
        st.ok("Done. (Crop sets the page's visible area — pair with Flatten-style re-render via Compress if you need the hidden content physically gone.)");
      }catch(e){ st.err(e.message||String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= RESIZE PAGES ================= */
Onyx.register({ id:"resize", name:"Resize / Scale Pages", icon:"resize",
  blurb:"Convert every page to A4, Letter, A5 or Legal — or scale by a percentage — while keeping content fitted and centred.",
  keywords:"resize scale pages a4 letter a5 legal page size convert",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept:".pdf", multiple:false, toolName:"Resize Pages", title:"Drop a PDF here" });
    p.appendChild(dz.element);
    let target = H.setting("resize","target","a4");
    p.appendChild(H.field("Target page size", H.radioRow([
      {value:"a4",label:"A4"},{value:"letter",label:"Letter"},{value:"a5",label:"A5"},{value:"legal",label:"Legal"},{value:"scale",label:"Scale by %"}
    ], target, v=>{ target=v; H.setSetting("resize","target",v); scaleRow.classList.toggle("hidden", v!=="scale"); })));
    const scaleRow = el("div", target==="scale"? "" : "hidden");
    const scaleIn = H.numInput(80, 10, 400); scaleRow.appendChild(H.field("Scale (%)", scaleIn)); p.appendChild(scaleRow);
    let fit = "contain";
    p.appendChild(H.field("Fit", H.radioRow([{value:"contain",label:"Fit inside (keep proportions)"},{value:"stretch",label:"Stretch to fill"}], fit, v=> fit=v)));
    const { btn, st, outs, showOut } = actionRow(p, "Resize & Save");
    btn.onclick = async ()=>{
      const file = dz.getFiles()[0]; if(!file){ st.err("Choose a PDF first."); return; }
      btn.disabled = true; st.say("Resizing…");
      try{
        const src = await H.loadPdf(file);
        const out = await PDFDocument.create();
        const SIZES = { a4:[595.28,841.89], letter:[612,792], a5:[419.53,595.28], legal:[612,1008] };
        for(let i=0;i<src.getPageCount();i++){
          const sp = src.getPage(i); const { width: sw, height: sh } = sp.getSize();
          const embedded = await out.embedPage(sp);
          let pw, ph;
          if(target === "scale"){ const f = (+scaleIn.value||100)/100; pw = sw*f; ph = sh*f; }
          else [pw, ph] = SIZES[target];
          const page = out.addPage([pw, ph]);
          if(target === "scale"){ const f = (+scaleIn.value||100)/100; page.drawPage(embedded, { x: 0, y: 0, width: sw*f, height: sh*f }); }
          else if(fit === "stretch"){ page.drawPage(embedded, { x: 0, y: 0, width: pw, height: ph }); }
          else { const s = Math.min(pw/sw, ph/sh); const w = sw*s, h = sh*s; page.drawPage(embedded, { x: (pw-w)/2, y: (ph-h)/2, width: w, height: h }); }
          st.prog((i+1)/src.getPageCount());
        }
        showOut(); outs.add(H.baseName(file.name)+"_resized.pdf", await out.save({ useObjectStreams: true }), src.getPageCount()+" pages");
        st.prog(1); st.ok("Done.");
      }catch(e){ st.err(e.message||String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= N-UP ================= */
Onyx.register({ id:"nup", name:"N-up (Pages per Sheet)", icon:"nup",
  blurb:"Print 2, 4, 6 or 9 pages on one sheet — handouts, proofs and paper-saving in seconds.",
  keywords:"n-up multiple pages per sheet handout booklet print impose",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept:".pdf", multiple:false, toolName:"N-up", title:"Drop a PDF here" });
    p.appendChild(dz.element);
    let per = 4, sheet = "a4", orient = "landscape";
    p.appendChild(H.field("Pages per sheet", H.radioRow([{value:2,label:"2"},{value:4,label:"4"},{value:6,label:"6"},{value:9,label:"9"}], per, v=> per=+v)));
    const c = el("div","cols"); c.style.gridTemplateColumns = "1fr 1fr";
    const c1 = el("div"), c2 = el("div");
    c1.appendChild(H.field("Sheet size", H.radioRow([{value:"a4",label:"A4"},{value:"letter",label:"Letter"}], sheet, v=> sheet=v)));
    c2.appendChild(H.field("Sheet orientation", H.radioRow([{value:"portrait",label:"Portrait"},{value:"landscape",label:"Landscape"}], orient, v=> orient=v)));
    c.append(c1, c2); p.appendChild(c);
    const gapIn = H.numInput(12, 0, 72); p.appendChild(H.field("Gap between pages (pt)", gapIn));
    const border = H.checkRow("Draw a light border around each page", true); p.appendChild(border.row);
    const { btn, st, outs, showOut } = actionRow(p, "Build N-up PDF");
    btn.onclick = async ()=>{
      const file = dz.getFiles()[0]; if(!file){ st.err("Choose a PDF first."); return; }
      btn.disabled = true; st.say("Building sheets…");
      try{
        const src = await H.loadPdf(file);
        const out = await PDFDocument.create();
        const { rgb } = window.PDFLib;
        let [sw, sh] = sheet === "a4"? [595.28, 841.89] : [612, 792];
        if(orient === "landscape") [sw, sh] = [sh, sw];
        const grids = { 2: orient==="landscape"? [2,1] : [1,2], 4: [2,2], 6: orient==="landscape"? [3,2] : [2,3], 9: [3,3] };
        const [colsN, rowsN] = grids[per];
        const margin = 28, gap = +gapIn.value||0;
        const cellW = (sw - margin*2 - gap*(colsN-1)) / colsN;
        const cellH = (sh - margin*2 - gap*(rowsN-1)) / rowsN;
        const total = src.getPageCount();
        let sheetPage = null;
        for(let i=0;i<total;i++){
          const slot = i % per;
          if(slot === 0) sheetPage = out.addPage([sw, sh]);
          const col = slot % colsN, row = Math.floor(slot / colsN);
          const cellX = margin + col * (cellW + gap);
          const cellTop = sh - margin - row * (cellH + gap);
          const embedded = await out.embedPage(src.getPage(i));
          const s = Math.min(cellW / embedded.width, cellH / embedded.height);
          const w = embedded.width * s, h = embedded.height * s;
          const x = cellX + (cellW - w)/2, y = cellTop - cellH + (cellH - h)/2;
          sheetPage.drawPage(embedded, { x, y, width: w, height: h });
          if(border.box.checked) sheetPage.drawRectangle({ x: cellX, y: cellTop - cellH, width: cellW, height: cellH, borderColor: rgb(0.75,0.78,0.82), borderWidth: 0.6 });
          st.prog((i+1)/total);
        }
        showOut(); outs.add(H.baseName(file.name)+"_"+per+"up.pdf", await out.save({ useObjectStreams: true }), Math.ceil(total/per)+" sheets from "+total+" pages");
        st.prog(1); st.ok("Done.");
      }catch(e){ st.err(e.message||String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= FILL FORMS ================= */
Onyx.register({ id:"fillform", name:"Fill PDF Forms", icon:"fillform", tag:"Free here",
  blurb:"Open a fillable PDF, type into its real form fields, and save a completed copy — optionally flattened so it can't be changed.",
  keywords:"fill form fields acroform complete application type answers",
  mount(root){
    const p = panel(root);
    let file = null, doc = null, fields = [];
    const dz = H.dropzone({ accept:".pdf", multiple:false, toolName:"Fill Forms", title:"Drop a fillable PDF here",
      onChange: async files=>{ file = files[0]||null; await load(); } });
    p.appendChild(dz.element);
    const formBox = el("div","mt"); p.appendChild(formBox);
    const flat = H.checkRow("Flatten after filling (bake answers into the page)", true); flat.row.classList.add("hidden"); p.appendChild(flat.row);
    const { btn, st, outs, showOut } = actionRow(p, "Save Filled PDF");
    btn.classList.add("hidden");
    async function load(){
      formBox.innerHTML = ""; fields = []; btn.classList.add("hidden"); flat.row.classList.add("hidden");
      if(!file) return;
      try{
        doc = await H.loadPdf(file);
        const form = doc.getForm();
        const list = form.getFields();
        if(!list.length){ st.say("This PDF has no fillable form fields. (If it only *looks* like a form, use Edit PDF to type onto it.)"); return; }
        st.say(list.length+" form field"+(list.length===1?"":"s")+" found. Fill them in below.");
        const PL = window.PDFLib;
        const kindOf = f => f instanceof PL.PDFTextField? "text" : f instanceof PL.PDFCheckBox? "check" : f instanceof PL.PDFRadioGroup? "radio" : f instanceof PL.PDFDropdown? "dropdown" : f instanceof PL.PDFOptionList? "optionlist" : f instanceof PL.PDFButton? "button" : "other";
        list.forEach(f=>{
          const kind = kindOf(f);
          const kindLabel = { text:"text", check:"checkbox", radio:"radio group", dropdown:"dropdown", optionlist:"list", button:"button", other:"field" }[kind];
          const wrap = el("div","field");
          const lab = el("label", null, esc(f.getName()) + "  ·  " + kindLabel);
          wrap.appendChild(lab);
          let input;
          if(kind === "text"){
            if(f.isMultiline()){ input = el("textarea"); input.rows = 3; }
            else input = H.textInput("");
            input.value = f.getText() || "";
          } else if(kind === "check"){
            input = el("input"); input.type = "checkbox"; input.checked = f.isChecked();
            const row = el("label","check"); row.appendChild(input); row.appendChild(el("span", null, "Checked")); wrap.appendChild(row);
            formBox.appendChild(wrap); fields.push({ f, input, kind }); return;
          } else if(kind === "dropdown" || kind === "radio" || kind === "optionlist"){
            input = el("select");
            const opts = f.getOptions();
            if(kind !== "radio" && !(f.isMultiline && false) && !(kind === "optionlist" && f.isMultiSelect && f.isMultiSelect())) { const none = el("option", null, "— leave blank —"); none.value = ""; input.appendChild(none); }
            opts.forEach(o=>{ const op = el("option", null, esc(o)); op.value = o; input.appendChild(op); });
            try{ const sel = f.getSelected(); if(sel && sel.length) input.value = sel[0]; }catch(e){}
          } else {
            input = H.textInput(""); input.disabled = true; input.placeholder = "This field type can't be edited here";
          }
          input.style.width = "100%"; wrap.appendChild(input);
          formBox.appendChild(wrap);
          fields.push({ f, input, kind });
        });
        btn.classList.remove("hidden"); flat.row.classList.remove("hidden");
      }catch(e){ st.err(e.message||String(e)); }
    }
    btn.onclick = async ()=>{
      if(!doc){ st.err("Choose a PDF first."); return; }
      btn.disabled = true; st.say("Saving…");
      try{
        for(const { f, input, kind } of fields){
          try{
            if(kind === "text") f.setText(input.value);
            else if(kind === "check"){ input.checked? f.check() : f.uncheck(); }
            else if(kind === "dropdown" || kind === "radio"){ if(input.value) f.select(input.value); else if(kind === "dropdown") f.clear(); }
            else if(kind === "optionlist"){ if(input.value) f.select(f.isMultiSelect && f.isMultiSelect()? [input.value] : input.value); }
          }catch(e){ /* field may be read-only */ }
        }
        const form = doc.getForm();
        try{ const { StandardFonts } = window.PDFLib; form.updateFieldAppearances(await doc.embedFont(StandardFonts.Helvetica)); }catch(e){}
        if(flat.box.checked) form.flatten();
        showOut(); outs.add(H.baseName(file.name)+"_filled.pdf", await doc.save({ useObjectStreams: true }), fields.length+" fields");
        st.ok("Done — filled copy saved.");
        await load(); // reload a fresh copy of the original so the form can be filled again differently
      }catch(e){ st.err(e.message||String(e)); }
      btn.disabled = false;
    };
  }
});
})();
