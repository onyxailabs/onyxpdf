/* OnyxPDF — core page tools: Merge, Split, Rotate, Organize, Flatten, PDF Info. */
(function(){
"use strict";
const H = window.H, { el, esc } = H;
const { PDFDocument, degrees } = window.PDFLib;

function panel(root){ const p = el("div","panel"); root.appendChild(p); return p; }
function actionRow(parent, label){
  const row = el("div","btn-row");
  const btn = el("button","btn", esc(label)); row.appendChild(btn); parent.appendChild(row);
  const st = H.statusBox(parent);
  const outPanel = el("div","panel"); outPanel.classList.add("hidden");
  const outs = H.outputList(); outPanel.appendChild(outs.element); parent.parentNode.appendChild(outPanel);
  return { btn, st, outs, showOut(){ outPanel.classList.remove("hidden"); } };
}
async function saveDoc(doc){ return doc.save({ useObjectStreams: true }); }

/* ================= MERGE ================= */
Onyx.register({ id:"merge", name:"Merge PDF", icon:"merge", tag:"Popular",
  blurb:"Combine any number of PDFs into one file, in the order you choose. No 25-file cap, no size cap.",
  keywords:"combine join merge multiple pdfs into one",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept:".pdf", multiple:true, reorderable:true, toolName:"Merge PDF",
      title:"Drop PDF files here", hint:"Drag files in the list (or use ↑ ↓) to set the merge order." });
    p.appendChild(dz.element);
    const { btn, st, outs, showOut } = actionRow(p, "Merge PDFs");
    btn.onclick = async ()=>{
      const files = dz.getFiles();
      if(files.length < 2){ st.err("Add at least two PDF files to merge."); return; }
      btn.disabled = true; st.say("Merging…");
      try{
        const out = await PDFDocument.create(); let pages = 0;
        for(let i=0;i<files.length;i++){
          st.prog((i)/files.length);
          const src = await H.loadPdf(files[i]);
          const copied = await out.copyPages(src, src.getPageIndices());
          copied.forEach(pg=> out.addPage(pg)); pages += copied.length;
        }
        const bytes = await saveDoc(out);
        showOut(); outs.add(base(files[0])+"_merged.pdf", bytes, pages+" pages");
        st.prog(1); st.ok("Done — "+pages+" pages merged from "+files.length+" files.");
      }catch(e){ st.err(friendly(e)); }
      btn.disabled = false;
    };
    function base(f){ return H.baseName(f.name); }
  }
});

/* ================= SPLIT ================= */
Onyx.register({ id:"split", name:"Split PDF", icon:"split", tag:"Popular",
  blurb:"Pull out the pages you need: one combined file, one file per range, or every page on its own.",
  keywords:"split extract pages separate ranges",
  mount(root){
    const p = panel(root);
    let pageCount = 0, srcDoc = null, srcFile = null;
    const dz = H.dropzone({ accept:".pdf", multiple:false, toolName:"Split PDF", title:"Drop a PDF here",
      onChange: async files=>{
        srcFile = files[0]||null; pageCount = 0; srcDoc = null; info.textContent = "";
        if(srcFile){ try{ srcDoc = await H.loadPdf(srcFile); pageCount = srcDoc.getPageCount(); info.textContent = pageCount+" pages"; }catch(e){ st.err(friendly(e)); } }
      }});
    p.appendChild(dz.element);
    const info = el("div","small mt"); p.appendChild(info);
    const ranges = H.textInput("", "e.g. 1-3, 5, 8-10");
    p.appendChild(H.field("Page ranges", ranges, "Pages are 1-based. Leave a range open-ended like “8-” for “to the end”."));
    let mode = H.setting("split","mode","one");
    const modeRow = H.radioRow([
      {value:"one", label:"One file with all ranges"},
      {value:"per-range", label:"One file per range"},
      {value:"each", label:"Every page separate"}
    ], mode, v=>{ mode=v; H.setSetting("split","mode",v); ranges.disabled = (v==="each"); });
    p.appendChild(H.field("Output", modeRow));
    const { btn, st, outs, showOut } = actionRow(p, "Split PDF");
    btn.onclick = async ()=>{
      if(!srcDoc){ st.err("Choose a PDF first."); return; }
      btn.disabled = true; outs.clear();
      try{
        showOut();
        if(mode === "each"){
          for(let i=0;i<pageCount;i++){
            const out = await PDFDocument.create();
            const [pg] = await out.copyPages(srcDoc, [i]); out.addPage(pg);
            outs.add(H.baseName(srcFile.name)+"_page-"+(i+1)+".pdf", await saveDoc(out));
            st.prog((i+1)/pageCount);
          }
          st.ok("Done — "+pageCount+" files created, one per page.");
        } else {
          const groups = ranges.value.split(",").map(s=>s.trim()).filter(Boolean);
          if(!groups.length) throw new Error("Enter at least one page range.");
          if(mode === "one"){
            const idx = H.parseRanges(ranges.value, pageCount);
            const out = await PDFDocument.create();
            const copied = await out.copyPages(srcDoc, idx); copied.forEach(pg=> out.addPage(pg));
            outs.add(H.baseName(srcFile.name)+"_extract.pdf", await saveDoc(out), idx.length+" pages");
            st.ok("Done — extracted "+idx.length+" pages.");
          } else {
            for(let gi=0; gi<groups.length; gi++){
              const idx = H.parseRanges(groups[gi], pageCount);
              const out = await PDFDocument.create();
              const copied = await out.copyPages(srcDoc, idx); copied.forEach(pg=> out.addPage(pg));
              outs.add(H.baseName(srcFile.name)+"_pages-"+groups[gi].replace(/\s+/g,"")+".pdf", await saveDoc(out), idx.length+" pages");
              st.prog((gi+1)/groups.length);
            }
            st.ok("Done — "+groups.length+" files created.");
          }
        }
        st.prog(1);
      }catch(e){ st.err(friendly(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= ROTATE ================= */
Onyx.register({ id:"rotate", name:"Rotate Pages", icon:"rotate",
  blurb:"Turn pages 90°, 180° or 270° — the whole document or just the pages you pick.",
  keywords:"rotate turn sideways upside down orientation",
  mount(root){
    const p = panel(root);
    let srcDoc = null, srcFile = null;
    const dz = H.dropzone({ accept:".pdf", multiple:false, toolName:"Rotate Pages", title:"Drop a PDF here",
      onChange: async files=>{ srcFile = files[0]||null; srcDoc = null;
        if(srcFile){ try{ srcDoc = await H.loadPdf(srcFile); info.textContent = srcDoc.getPageCount()+" pages"; }catch(e){ st.err(friendly(e)); } } }});
    p.appendChild(dz.element);
    const info = el("div","small mt"); p.appendChild(info);
    let angle = 90;
    p.appendChild(H.field("Rotation (clockwise)", H.radioRow([
      {value:90,label:"90° →"},{value:180,label:"180°"},{value:270,label:"270° ↩"}
    ], angle, v=> angle=+v)));
    const rangeIn = H.textInput("", "Leave empty for all pages — or e.g. 1-3, 5");
    p.appendChild(H.field("Pages to rotate", rangeIn));
    const { btn, st, outs, showOut } = actionRow(p, "Rotate & Save");
    btn.onclick = async ()=>{
      if(!srcDoc){ st.err("Choose a PDF first."); return; }
      btn.disabled = true;
      try{
        const total = srcDoc.getPageCount();
        const idx = rangeIn.value.trim()? H.parseRanges(rangeIn.value, total) : srcDoc.getPageIndices();
        idx.forEach(i=>{ const pg = srcDoc.getPage(i); const cur = pg.getRotation().angle||0; pg.setRotation(degrees((cur+angle)%360)); });
        showOut(); outs.add(H.baseName(srcFile.name)+"_rotated.pdf", await saveDoc(srcDoc), idx.length+" pages rotated");
        st.ok("Done — rotated "+idx.length+" of "+total+" pages.");
      }catch(e){ st.err(friendly(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= ORGANIZE ================= */
Onyx.register({ id:"organize", name:"Organize Pages", icon:"organize", tag:"Visual editor",
  blurb:"See every page, drag to reorder, delete pages, rotate singles, insert blanks and reverse the order.",
  keywords:"organize reorder delete pages remove insert blank reverse arrange thumbnails",
  mount(root){
    const p = panel(root);
    let items = []; // {src: pageIndex|null(blank), rot: delta, deleted: bool}
    let srcDoc = null, srcFile = null, firstSize = { width: 595, height: 842 };
    const dz = H.dropzone({ accept:".pdf", multiple:false, toolName:"Organize Pages", title:"Drop a PDF here",
      onChange: files=>{ srcFile = files[0]||null; if(srcFile) build(); }});
    p.appendChild(dz.element);
    const tools = el("div","btn-row");
    const revBtn = el("button","btn ghost sm","Reverse order");
    const blankBtn = el("button","btn ghost sm","+ Insert blank page");
    const restoreBtn = el("button","btn ghost sm","Restore deleted");
    tools.append(revBtn, blankBtn, restoreBtn); tools.classList.add("hidden"); p.appendChild(tools);
    const grid = el("div","thumbs mt"); p.appendChild(grid);
    const { btn, st, outs, showOut } = actionRow(p, "Build Organized PDF");
    btn.classList.add("hidden");
    async function build(){
      st.say("Rendering page thumbnails…"); grid.innerHTML=""; items=[];
      try{
        srcDoc = await H.loadPdf(srcFile);
        const js = await H.loadPdfJs(srcFile);
        const n = js.numPages; const p0 = srcDoc.getPage(0); firstSize = { width: p0.getWidth(), height: p0.getHeight() };
        for(let i=1;i<=n;i++){
          const scale = 150 / (await js.getPage(i)).getViewport({scale:1}).width;
          const { canvas } = await H.renderPage(js, i, Math.min(scale, 0.6));
          items.push({ src: i-1, rot: 0, deleted: false, canvas });
          st.prog(i/n);
        }
        st.prog(1); st.say(n+" pages loaded. Drag thumbnails to reorder; × removes a page from the output.");
        tools.classList.remove("hidden"); btn.classList.remove("hidden"); render();
      }catch(e){ st.err(friendly(e)); }
    }
    function render(){
      grid.innerHTML = "";
      items.forEach((it, pos)=>{
        const t = el("div","thumb"+(it.deleted?" deleted":"")); t.draggable = true;
        if(it.src === null){
          const c = el("canvas"); c.width=110; c.height=Math.round(110*firstSize.height/firstSize.width);
          const g = c.getContext("2d"); g.fillStyle="#fff"; g.fillRect(0,0,c.width,c.height); g.fillStyle="#8aa"; g.font="bold 12px sans-serif"; g.textAlign="center"; g.fillText("BLANK", c.width/2, c.height/2);
          t.appendChild(c);
        } else {
          const c = it.canvas.cloneNode(); c.getContext("2d").drawImage(it.canvas, 0, 0);
          if(it.rot){ c.style.transform = `rotate(${it.rot}deg) scale(.82)`; }
          t.appendChild(c);
        }
        const label = el("div","pno", it.src===null? "Blank page" : "Page "+(it.src+1)+(it.rot? " · "+it.rot+"°":""));
        t.appendChild(label);
        const x = el("button","x", it.deleted? "↺" : "×"); x.title = it.deleted? "Restore page" : "Remove page";
        x.onclick = ()=>{ it.deleted = !it.deleted; render(); };
        t.appendChild(x);
        if(it.src !== null){
          const r = el("button","mv","⟳"); r.title="Rotate this page 90°"; r.style.cssText="position:absolute;top:4px;left:4px;width:22px;height:22px;border-radius:7px;border:none;background:rgba(10,20,35,.75);color:#a5f3fc";
          r.onclick = ()=>{ it.rot = (it.rot+90)%360; render(); };
          t.appendChild(r);
        }
        t.addEventListener("dragstart", e=>{ t.classList.add("dragging"); e.dataTransfer.setData("text/plain", String(pos)); });
        t.addEventListener("dragend", ()=> t.classList.remove("dragging"));
        t.addEventListener("dragover", e=> e.preventDefault());
        t.addEventListener("drop", e=>{ e.preventDefault(); const from = +e.dataTransfer.getData("text/plain"); if(!isNaN(from)&&from!==pos){ const [m]=items.splice(from,1); items.splice(pos,0,m); render(); } });
        grid.appendChild(t);
      });
    }
    revBtn.onclick = ()=>{ items.reverse(); render(); };
    blankBtn.onclick = ()=>{ items.push({ src:null, rot:0, deleted:false, canvas:null }); render(); };
    restoreBtn.onclick = ()=>{ items.forEach(i=> i.deleted=false); render(); };
    btn.onclick = async ()=>{
      if(!srcDoc){ st.err("Choose a PDF first."); return; }
      const keep = items.filter(i=>!i.deleted);
      if(!keep.length){ st.err("Every page is removed — restore at least one page."); return; }
      btn.disabled = true; st.say("Building…");
      try{
        const out = await PDFDocument.create();
        for(const it of keep){
          if(it.src === null){ out.addPage([firstSize.width, firstSize.height]); continue; }
          const [pg] = await out.copyPages(srcDoc, [it.src]); out.addPage(pg);
          if(it.rot){ const cur = pg.getRotation().angle||0; pg.setRotation(degrees((cur+it.rot)%360)); }
        }
        showOut(); outs.add(H.baseName(srcFile.name)+"_organized.pdf", await saveDoc(out), keep.length+" pages");
        st.ok("Done — "+keep.length+" pages in the new file.");
      }catch(e){ st.err(friendly(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= FLATTEN ================= */
Onyx.register({ id:"flatten", name:"Flatten PDF", icon:"flatten",
  blurb:"Bake form fields into the page so the filled values can't be edited or lost.",
  keywords:"flatten form fields bake lock form",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept:".pdf", multiple:true, toolName:"Flatten PDF", title:"Drop PDF files here" });
    p.appendChild(dz.element);
    const note = el("p","small", "Flattening merges interactive form fields into the page content. (Some tools charge for this; here it's free.) Note: link annotations and comments are not annotations-flattened by this tool — form fields are."); p.appendChild(note);
    const { btn, st, outs, showOut } = actionRow(p, "Flatten & Save");
    btn.onclick = async ()=>{
      const files = dz.getFiles(); if(!files.length){ st.err("Choose at least one PDF."); return; }
      btn.disabled = true;
      try{
        showOut();
        for(let i=0;i<files.length;i++){
          const doc = await H.loadPdf(files[i]);
          let hadForm = false;
          try{ const form = doc.getForm(); const fields = form.getFields(); if(fields.length){ form.flatten(); hadForm = true; } }catch(e){ /* no form */ }
          outs.add(H.baseName(files[i].name)+"_flattened.pdf", await saveDoc(doc), hadForm? "form flattened" : "no form fields found");
          st.prog((i+1)/files.length);
        }
        st.prog(1); st.ok("Done.");
      }catch(e){ st.err(friendly(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= PDF INFO ================= */
Onyx.register({ id:"pdfinfo", name:"PDF Info & Metadata", icon:"pdfinfo",
  blurb:"See page count, page sizes, PDF version, author data and embedded metadata — without uploading the file anywhere.",
  keywords:"info metadata properties details version inspect",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept:".pdf", multiple:false, toolName:"PDF Info", title:"Drop a PDF here",
      onChange: async files=>{ if(files[0]) show(files[0]); } });
    p.appendChild(dz.element);
    const out = el("div","mt"); p.appendChild(out);
    const st = H.statusBox(p);
    async function show(file){
      out.innerHTML = ""; st.say("Reading…");
      try{
        const doc = await H.loadPdf(file);
        const js = await H.loadPdfJs(file);
        const meta = await js.getMetadata().catch(()=>({ info:{}, metadata:null }));
        const info = meta.info || {};
        const sizes = new Set(); doc.getPages().forEach(pg=> sizes.add(Math.round(pg.getWidth())+" × "+Math.round(pg.getHeight())+" pt"));
        const rows = [
          ["File name", file.name], ["File size", H.fmtBytes(file.size)],
          ["Pages", doc.getPageCount()], ["Page sizes", [...sizes].join(" · ")||"—"],
          ["PDF version", info.PDFFormatVersion || "—"],
          ["Title", doc.getTitle() || info.Title || "—"], ["Author", doc.getAuthor() || info.Author || "—"],
          ["Subject", doc.getSubject() || info.Subject || "—"], ["Keywords", doc.getKeywords() || "—"],
          ["Creator", doc.getCreator() || info.Creator || "—"], ["Producer", doc.getProducer() || info.Producer || "—"],
          ["Created", fmtDate(doc.getCreationDate() || info.CreationDate)], ["Modified", fmtDate(doc.getModificationDate() || info.ModDate)],
          ["Encrypted", js.isEncrypted? "Yes — password protected" : "No"],
          ["Has form fields", hasForm(doc)], ["Is linearized (Fast Web View)", info.IsLinearized? "Yes":"No / unknown"]
        ];
        const table = el("div","out-list");
        rows.forEach(([k,v])=>{ const r = el("div","out-item"); r.innerHTML = `<span style="min-width:170px;color:var(--muted);font-weight:700">${esc(k)}</span><span class="fname">${esc(String(v))}</span>`; table.appendChild(r); });
        out.appendChild(table);
        if(meta.metadata){ const pre = el("pre"); pre.style.cssText="white-space:pre-wrap;font-size:11.5px;color:var(--muted);max-height:220px;overflow:auto"; pre.textContent = "XMP metadata:\n" + meta.metadata.getRaw(); out.appendChild(pre); }
        st.ok("Read locally — nothing was uploaded.");
      }catch(e){ st.err(friendly(e)); }
    }
    function hasForm(doc){ try{ return doc.getForm().getFields().length? doc.getForm().getFields().length+" fields" : "No"; }catch(e){ return "No"; } }
    function fmtDate(d){ if(!d) return "—"; try{ return new Date(d).toLocaleString(); }catch(e){ return String(d); } }
  }
});

function friendly(e){
  const m = (e && e.message) || String(e);
  if(/password|encrypt/i.test(m)) return "This PDF is password-protected. Unlock it first, then try again.";
  if(/Invalid PDF|Failed to parse/i.test(m)) return "That file doesn't look like a valid PDF.";
  return m;
}
})();
