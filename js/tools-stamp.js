/* OnyxPDF — stamping tools: Watermark, Page Numbers, Header & Footer, Bates, Metadata Editor.
   One shared engine; competitors charge for most of these. */
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
const COLORS = { Gray:[0.45,0.45,0.45], Red:[0.85,0.15,0.15], Blue:[0.1,0.3,0.85], Teal:[0.05,0.6,0.6], Black:[0.1,0.1,0.1], Orange:[0.9,0.45,0.05] };
function colorSelect(toolId){ return H.selectInput(Object.keys(COLORS).map(k=>[k,k]), H.setting(toolId,"color","Gray")); }
function posGrid(current, onPick){
  const wrap = el("div","pos-grid");
  const names = [["top-left","↖"],["top-center","↑"],["top-right","↗"],["middle-left","←"],["center","•"],["middle-right","→"],["bottom-left","↙"],["bottom-center","↓"],["bottom-right","↘"]];
  names.forEach(([v,g])=>{ const b = el("button", null, g); b.type="button"; b.title=v.replace("-"," "); if(v===current) b.classList.add("active");
    b.onclick=()=>{ H.$$(".pos-grid button", wrap).forEach(x=>x.classList.remove("active")); b.classList.add("active"); onPick(v); }; wrap.appendChild(b); });
  return wrap;
}
function posXY(pos, w, h, tw, th, margin){
  const m = margin==null? 36 : margin;
  const x = pos.includes("left")? m : pos.includes("right")? w - m - tw : (w - tw)/2;
  const y = pos.startsWith("top")? h - m - th : pos.startsWith("bottom")? m : (h - th)/2;
  return [x, y];
}
async function singleFile(root, toolName, title){
  const p = panel(root);
  const dz = H.dropzone({ accept:".pdf", multiple:false, toolName, title: title||"Drop a PDF here" });
  p.appendChild(dz.element);
  return { p, dz };
}
function targetPages(rangeStr, total){
  if(!rangeStr || !rangeStr.trim()) return Array.from({length: total}, (_,i)=> i);
  return H.parseRanges(rangeStr, total);
}

/* ================= WATERMARK ================= */
Onyx.register({ id:"watermark", name:"Watermark Text", icon:"watermark", tag:"Free here · paid elsewhere",
  blurb:"Stamp your text on every page — your words, size, colour, angle, transparency and layout. Tools elsewhere paywall these options.",
  keywords:"watermark stamp confidential draft copyright text overlay brand",
  mount(root){
    (async ()=>{
      const { p, dz } = await singleFile(root, "Watermark Text");
      const txt = H.textInput(H.setting("watermark","text","CONFIDENTIAL"));
      txt.oninput = ()=> H.setSetting("watermark","text", txt.value);
      p.appendChild(H.field("Watermark text", txt));
      const cols = el("div","cols"); cols.style.gridTemplateColumns = "1fr 1fr";
      const sizeIn = H.numInput(H.setting("watermark","size",48), 8, 200);
      const opaIn = H.slider(H.setting("watermark","opacity",0.25)*100, 5, 100, 1); const opaVal = el("span","fsize", Math.round(opaIn.value)+"%");
      opaIn.oninput = ()=> opaVal.textContent = Math.round(opaIn.value)+"%";
      const rotIn = H.numInput(H.setting("watermark","rot",45), -90, 90);
      const colSel = colorSelect("watermark"); colSel.onchange = ()=> H.setSetting("watermark","color", colSel.value);
      const left = el("div"); left.append(H.field("Text size (pt)", sizeIn), H.field("Rotation (degrees)", rotIn));
      const right = el("div"); const of = H.field("Opacity", opaIn); of.appendChild(opaVal); right.append(of, H.field("Colour", colSel));
      cols.append(left, right); p.appendChild(cols);
      let layout = H.setting("watermark","layout","diagonal");
      p.appendChild(H.field("Layout", H.radioRow([
        {value:"diagonal", label:"Diagonal centre"},{value:"center", label:"Centre"},{value:"tile", label:"Tiled (repeated)"},{value:"top", label:"Top strip"},{value:"bottom", label:"Bottom strip"}
      ], layout, v=>{ layout=v; H.setSetting("watermark","layout",v); })));
      const rangeIn = H.textInput("", "Empty = all pages, or e.g. 1-3, 5");
      p.appendChild(H.field("Pages", rangeIn));
      const { btn, st, outs, showOut } = actionRow(p, "Apply Watermark");
      btn.onclick = async ()=>{
        const file = dz.getFiles()[0]; if(!file){ st.err("Choose a PDF first."); return; }
        if(!txt.value.trim()){ st.err("Enter the watermark text."); return; }
        btn.disabled = true; st.say("Stamping…");
        try{
          const doc = await H.loadPdf(file);
          const font = await doc.embedFont(StandardFonts.HelveticaBold);
          txt.value = H.safeWinAnsi(txt.value) || txt.value;
          const size = Math.max(8, +sizeIn.value||48), opacity = Math.min(1, Math.max(0.05, opaIn.value/100));
          const angle = Math.max(-90, Math.min(90, +rotIn.value||0));
          const [r,g,b] = COLORS[colSel.value] || COLORS.Gray;
          const idx = targetPages(rangeIn.value, doc.getPageCount());
          idx.forEach(i=>{
            const page = doc.getPage(i); const { width:w, height:h } = page.getSize();
            const tw = font.widthOfTextAtSize(txt.value, size);
            const draw = (x, y, rot)=> page.drawText(txt.value, { x, y, size, font, color: rgb(r,g,b), opacity, rotate: degrees(rot) });
            if(layout === "tile"){
              for(let y = 40; y < h; y += size*2.6) for(let x = 20; x < w; x += tw + size*1.6) draw(x, y, angle);
            } else if(layout === "diagonal"){
              draw(w/2 - (tw/2)*Math.cos(angle*Math.PI/180), h/2 - (tw/2)*Math.sin(angle*Math.PI/180), angle);
            } else if(layout === "center"){ draw((w-tw)/2, h/2, angle); }
            else if(layout === "top"){ draw((w-tw)/2, h - size - 24, 0); }
            else { draw((w-tw)/2, 30, 0); }
          });
          showOut(); outs.add(H.baseName(file.name)+"_watermarked.pdf", await doc.save({ useObjectStreams: true }), idx.length+" pages stamped");
          st.ok("Done — watermark applied to "+idx.length+" pages.");
        }catch(e){ st.err(e.message||String(e)); }
        btn.disabled = false;
      };
    })();
  }
});

/* ================= shared number-stamp builder ================= */
function numberStampTool(cfg){
  Onyx.register({ id: cfg.id, name: cfg.name, icon: cfg.icon, tag: cfg.tag, blurb: cfg.blurb, keywords: cfg.keywords,
    mount(root){
      (async ()=>{
        const { p, dz } = await singleFile(root, cfg.name);
        const built = cfg.fields(p);
        const { btn, st, outs, showOut } = actionRow(p, cfg.button);
        btn.onclick = async ()=>{
          const file = dz.getFiles()[0]; if(!file){ st.err("Choose a PDF first."); return; }
          btn.disabled = true; st.say("Working…");
          try{
            const doc = await H.loadPdf(file);
            const font = await doc.embedFont(StandardFonts.Helvetica);
            const total = doc.getPageCount();
            const idx = targetPages(built.pages(), total);
            idx.forEach((pi, k)=>{
              const text = H.safeWinAnsi(built.text(pi+1, total, k));
              if(!text) return;
              const page = doc.getPage(pi); const { width:w, height:h } = page.getSize();
              const size = built.size();
              const tw = font.widthOfTextAtSize(text, size);
              const [x, y] = posXY(built.pos(), w, h, tw, size, built.margin());
              page.drawText(text, { x, y, size, font, color: rgb(...built.rgb()) });
            });
            showOut(); outs.add(H.baseName(file.name)+cfg.suffix, await doc.save({ useObjectStreams: true }), idx.length+" pages");
            st.ok("Done — stamped "+idx.length+" pages.");
          }catch(e){ st.err(e.message||String(e)); }
          btn.disabled = false;
        };
      })();
    }});
}

/* ================= PAGE NUMBERS ================= */
numberStampTool({
  id:"pagenumbers", name:"Page Numbers", icon:"pagenum", tag:"Free here · paid elsewhere",
  blurb:"Add page numbers in any corner, in the format you like, starting from any number.",
  keywords:"page numbers numbering footer paginate",
  button:"Add Page Numbers", suffix:"_numbered.pdf",
  fields(p){
    let format = H.setting("pagenumbers","format","page-of");
    p.appendChild(H.field("Format", H.radioRow([
      {value:"plain", label:"1"}, {value:"page", label:"Page 1"}, {value:"page-of", label:"Page 1 of 12"}, {value:"slash", label:"1 / 12"}, {value:"dash", label:"– 1 –"}
    ], format, v=>{ format=v; H.setSetting("pagenumbers","format",v); })));
    let pos = H.setting("pagenumbers","pos","bottom-center");
    p.appendChild(H.field("Position", posGrid(pos, v=>{ pos=v; H.setSetting("pagenumbers","pos",v); })));
    const startIn = H.numInput(H.setting("pagenumbers","start",1), -999, 9999);
    startIn.onchange = ()=> H.setSetting("pagenumbers","start", +startIn.value||1);
    const sizeIn = H.numInput(H.setting("pagenumbers","size",11), 6, 40);
    const skip = H.checkRow("Skip the first page (cover)", H.setting("pagenumbers","skip",false));
    skip.box.onchange = ()=> H.setSetting("pagenumbers","skip", skip.box.checked);
    const rangeIn = H.textInput("", "Empty = all pages");
    p.append(startIn && H.field("Starting number", startIn), H.field("Text size (pt)", sizeIn), skip.row, H.field("Pages", rangeIn));
    return {
      pages: ()=> rangeIn.value,
      text(n, total){ const disp = n + ((+startIn.value||1) - 1);
        if(skip.box.checked && n === 1) return "";
        switch(format){ case "plain": return String(disp); case "page": return "Page "+disp; case "slash": return disp+" / "+(total + ((+startIn.value||1)-1)); case "dash": return "– "+disp+" –"; default: return "Page "+disp+" of "+(total + ((+startIn.value||1)-1)); } },
      size: ()=> Math.max(6, +sizeIn.value||11),
      pos: ()=> pos, margin: ()=> 30, rgb: ()=> [0.25,0.25,0.25]
    };
  }
});

/* ================= BATES ================= */
numberStampTool({
  id:"bates", name:"Bates Numbering", icon:"bates", tag:"Legal offices: free here",
  blurb:"Sequential Bates stamps for legal and records work — prefix, zero-padded numbers, your start point.",
  keywords:"bates numbering legal stamp sequential exhibit discovery",
  button:"Apply Bates Numbers", suffix:"_bates.pdf",
  fields(p){
    const prefix = H.textInput(H.setting("bates","prefix","EXHIBIT-"));
    prefix.oninput = ()=> H.setSetting("bates","prefix", prefix.value);
    const suffixIn = H.textInput(H.setting("bates","suffix",""));
    const startIn = H.numInput(H.setting("bates","start",1), 0, 999999999);
    const digitsIn = H.numInput(H.setting("bates","digits",6), 1, 12);
    const sizeIn = H.numInput(11, 6, 40);
    let pos = H.setting("bates","pos","bottom-right");
    p.append(H.field("Prefix", prefix), H.field("Suffix", suffixIn), H.field("Starting number", startIn), H.field("Digits (zero-padded)", digitsIn), H.field("Text size (pt)", sizeIn), H.field("Position", posGrid(pos, v=>{ pos=v; H.setSetting("bates","pos",v); })));
    const rangeIn = H.textInput("", "Empty = all pages"); p.appendChild(H.field("Pages", rangeIn));
    return {
      pages: ()=> rangeIn.value,
      text(n, total, k){ const num = String((+startIn.value||1) + k).padStart(Math.max(1, +digitsIn.value||6), "0"); return prefix.value + num + suffixIn.value; },
      size: ()=> Math.max(6, +sizeIn.value||11), pos: ()=> pos, margin: ()=> 30, rgb: ()=> [0.1,0.1,0.1]
    };
  }
});

/* ================= HEADER & FOOTER ================= */
Onyx.register({ id:"headerfooter", name:"Header & Footer", icon:"headerfooter",
  blurb:"Running headers and footers on every page — with {page}, {total} and {date} placeholders.",
  keywords:"header footer running title document name date stamp",
  mount(root){
    (async ()=>{
      const { p, dz } = await singleFile(root, "Header & Footer");
      p.appendChild(el("p","small","Use {page} for the page number, {total} for the page count, {date} for today. Leave a box empty to skip that spot."));
      function trio(label){
        const grid = el("div","cols"); grid.style.gridTemplateColumns = "1fr 1fr 1fr";
        const L = H.textInput("", "Left"), C = H.textInput("", "Centre"), R = H.textInput("", "Right");
        const mk = (inp, t)=>{ const f = H.field(t, inp); return f; };
        grid.append(mk(L,"Left"), mk(C,"Centre"), mk(R,"Right"));
        const wrap = el("div"); wrap.appendChild(el("div","section-title", label)); wrap.appendChild(grid);
        p.appendChild(wrap);
        return [L, C, R];
      }
      const H3 = trio("Header"), F3 = trio("Footer");
      const sizeIn = H.numInput(H.setting("headerfooter","size",10), 6, 30);
      p.appendChild(H.field("Text size (pt)", sizeIn));
      const skip = H.checkRow("Skip the first page", false); p.appendChild(skip.row);
      const rangeIn = H.textInput("", "Empty = all pages"); p.appendChild(H.field("Pages", rangeIn));
      const { btn, st, outs, showOut } = actionRow(p, "Apply Header & Footer");
      btn.onclick = async ()=>{
        const file = dz.getFiles()[0]; if(!file){ st.err("Choose a PDF first."); return; }
        btn.disabled = true; st.say("Working…");
        try{
          const doc = await H.loadPdf(file);
          const font = await doc.embedFont(StandardFonts.Helvetica);
          const total = doc.getPageCount(); const size = Math.max(6, +sizeIn.value||10);
          const today = new Date().toLocaleDateString();
          const idx = targetPages(rangeIn.value, total);
          const fill = (tmpl, n)=> tmpl.replaceAll("{page}", String(n)).replaceAll("{total}", String(total)).replaceAll("{date}", today);
          idx.forEach(pi=>{
            if(skip.box.checked && pi === 0) return;
            const page = doc.getPage(pi); const { width:w, height:h } = page.getSize();
            const zones = [ [H3, h - 22 - size], [F3, 22] ];
            zones.forEach(([inputs, y])=>{
              inputs.forEach((inp, zi)=>{
                const text = H.safeWinAnsi(fill(inp.value, pi+1)); if(!text) return;
                const tw = font.widthOfTextAtSize(text, size);
                const x = zi===0? 36 : zi===2? w - 36 - tw : (w - tw)/2;
                page.drawText(text, { x, y, size, font, color: rgb(0.3,0.3,0.3) });
              });
            });
          });
          showOut(); outs.add(H.baseName(file.name)+"_headerfooter.pdf", await doc.save({ useObjectStreams: true }));
          st.ok("Done.");
        }catch(e){ st.err(e.message||String(e)); }
        btn.disabled = false;
      };
    })();
  }
});

/* ================= METADATA EDITOR ================= */
Onyx.register({ id:"metadata", name:"Edit Metadata", icon:"metadata",
  blurb:"Set the title, author, subject and keywords stored inside the PDF — the details readers and search tools display.",
  keywords:"metadata edit title author subject keywords properties producer creator",
  mount(root){
    (async ()=>{
      const p = panel(root);
      let srcFile = null, srcDoc = null;
      const dz = H.dropzone({ accept:".pdf", multiple:false, toolName:"Edit Metadata", title:"Drop a PDF here",
        onChange: async files=>{
          srcFile = files[0]||null; srcDoc = null;
          if(!srcFile) return;
          try{ srcDoc = await H.loadPdf(srcFile);
            F.title.value = srcDoc.getTitle()||""; F.author.value = srcDoc.getAuthor()||""; F.subject.value = srcDoc.getSubject()||"";
            F.keywords.value = srcDoc.getKeywords()||""; F.creator.value = srcDoc.getCreator()||""; F.producer.value = srcDoc.getProducer()||"";
            form.classList.remove("hidden"); btn.classList.remove("hidden"); st.say("Metadata loaded — edit and save.");
          }catch(e){ st.err(e.message||String(e)); }
        }});
      p.appendChild(dz.element);
      const form = el("div"); form.classList.add("hidden"); p.appendChild(form);
      const F = {};
      [["title","Title"],["author","Author"],["subject","Subject"],["keywords","Keywords (comma separated)"],["creator","Creator"],["producer","Producer"]].forEach(([k,l])=>{
        F[k] = H.textInput(""); form.appendChild(H.field(l, F[k]));
      });
      const updMod = H.checkRow("Update “modified” date to now", true); form.appendChild(updMod.row);
      const { btn, st, outs, showOut } = actionRow(p, "Save with New Metadata");
      btn.classList.add("hidden");
      btn.onclick = async ()=>{
        if(!srcDoc){ st.err("Choose a PDF first."); return; }
        btn.disabled = true;
        try{
          srcDoc.setTitle(F.title.value); srcDoc.setAuthor(F.author.value); srcDoc.setSubject(F.subject.value);
          srcDoc.setKeywords(F.keywords.value.split(",").map(s=>s.trim()).filter(Boolean));
          srcDoc.setCreator(F.creator.value); srcDoc.setProducer(F.producer.value);
          if(updMod.box.checked) srcDoc.setModificationDate(new Date());
          showOut(); outs.add(H.baseName(srcFile.name)+"_metadata.pdf", await srcDoc.save({ useObjectStreams: true }), "metadata updated");
          st.ok("Done — metadata updated."); srcDoc = await H.loadPdf(srcFile);
        }catch(e){ st.err(e.message||String(e)); }
        btn.disabled = false;
      };
    })();
  }
});
})();
