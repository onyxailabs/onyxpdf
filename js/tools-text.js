/* OnyxPDF — text tools: Extract Text, PDF→Word, PDF→CSV, Compare, Word/Text→PDF. */
(function(){
"use strict";
const H = window.H, { el, esc } = H;
const { StandardFonts } = window.PDFLib;

function panel(root){ const p = el("div","panel"); root.appendChild(p); return p; }
function actionRow(parent, label){
  const row = el("div","btn-row"); const btn = el("button","btn", esc(label)); row.appendChild(btn); parent.appendChild(row);
  const st = H.statusBox(parent);
  const outPanel = el("div","panel"); outPanel.classList.add("hidden");
  const outs = H.outputList(); outPanel.appendChild(outs.element); parent.parentNode.appendChild(outPanel);
  return { btn, st, outs, showOut(){ outPanel.classList.remove("hidden"); } };
}

/* ---------- positioned text extraction via pdf.js ---------- */
async function fontIsBold(page, fontName){
  try{
    const obj = await new Promise(res=>{ let done=false; page.commonObjs.get(fontName, v=>{ if(!done){ done=true; res(v); } }); setTimeout(()=>{ if(!done){ done=true; res(null); } }, 60); });
    return !!(obj && /bold/i.test(obj.name||""));
  }catch(e){ return false; }
}
async function extractLines(file, onProgress){
  const js = await H.loadPdfJs(file);
  const pages = [];
  for(let i=1;i<=js.numPages;i++){
    const page = await js.getPage(i);
    const tc = await page.getTextContent();
    const raw = [];
    for(const it of tc.items){
      if(!it.str || !it.str.trim()) continue;
      const size = it.height || Math.abs(it.transform[3]) || 10;
      raw.push({ text: it.str, x: it.transform[4], y: it.transform[5], size, bold: await fontIsBold(page, it.fontName), width: it.width||0 });
    }
    raw.sort((a,b)=> (Math.abs(b.y-a.y) > 2 ? b.y - a.y : a.x - b.x));
    const lines = [];
    for(const it of raw){
      const line = lines[lines.length-1];
      if(line && Math.abs(line.y - it.y) <= Math.max(2.5, it.size*0.4)){ line.items.push(it); line.y = Math.min(line.y, it.y); }
      else lines.push({ y: it.y, size: it.size, items: [it] });
    }
    const built = lines.map(L=>{
      L.items.sort((a,b)=> a.x - b.x);
      let text = ""; let bold = L.items.length>0 && L.items.every(x=>x.bold); let prev = null;
      for(const it of L.items){
        if(prev && it.x - prev.end > Math.max(2, it.size*0.22)) text += " ";
        text += it.text; prev = { end: it.x + (it.width||0) };
      }
      return { text: text.trim(), size: L.size, bold, y: L.y };
    }).filter(L=> L.text);
    pages.push(built);
    if(onProgress) onProgress(i/js.numPages);
  }
  return pages;
}
const plainText = pages => pages.map((lines, i)=> lines.map(L=>L.text).join("\n")).join("\n\n");
function paragraphsOf(lines){
  const paras = []; let cur = null;
  for(const L of lines){
    const isHead = L.size >= 15;
    if(!cur || isHead || (cur.head && !isHead) || (L.gapBefore)) { cur = { text: L.text, size: L.size, bold: L.bold, head: isHead }; paras.push(cur); }
    else cur.text += " " + L.text;
  }
  return paras;
}

/* ================= EXTRACT TEXT ================= */
Onyx.register({ id:"extract", name:"Extract Text", icon:"extract", tag:"Free here",
  blurb:"Pull all the text out of a PDF — read it, copy it, or save it as a .txt file. (Scanned PDFs need the OCR tool instead.)",
  keywords:"extract text copy txt read content get text out",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept:".pdf", multiple:false, toolName:"Extract Text", title:"Drop a PDF here" });
    p.appendChild(dz.element);
    const markers = H.checkRow("Mark page breaks in the output (=== Page 2 ===)", true); p.appendChild(markers.row);
    const { btn, st, outs, showOut } = actionRow(p, "Extract Text");
    const ta = el("textarea"); ta.rows = 14; ta.placeholder = "Extracted text will appear here…"; ta.style.cssText = "width:100%;border-radius:10px;border:1px solid var(--border);background:var(--input);padding:12px;font-size:13.5px;line-height:1.55";
    const taWrap = el("div","mt"); taWrap.appendChild(ta); taWrap.classList.add("hidden"); root.appendChild(taWrap);
    btn.onclick = async ()=>{
      const file = dz.getFiles()[0]; if(!file){ st.err("Choose a PDF first."); return; }
      btn.disabled = true; st.say("Extracting…");
      try{
        const pages = await extractLines(file, v=> st.prog(v));
        let text;
        if(markers.box.checked) text = pages.map((lines, i)=> "=== Page "+(i+1)+" ===\n" + lines.map(L=>L.text).join("\n")).join("\n\n");
        else text = plainText(pages);
        ta.value = text; taWrap.classList.remove("hidden");
        showOut();
        outs.text(H.baseName(file.name)+".txt", text, text.length.toLocaleString()+" characters");
        const copyBtn = el("button","dl-btn","Copy text"); copyBtn.onclick = async ()=>{ try{ await navigator.clipboard.writeText(ta.value); H.toast("Text copied"); }catch(e){ ta.select(); document.execCommand("copy"); H.toast("Text copied"); } };
        outs.element.lastChild.appendChild(copyBtn);
        st.prog(1);
        st.ok(text.trim()? "Done — "+text.length.toLocaleString()+" characters from "+pages.length+" pages." : "No selectable text found. If this is a scanned document, use the OCR tool.");
      }catch(e){ st.err(e.message||String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= PDF → WORD ================= */
function xe(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function docxBytes(paras){
  const body = paras.map(pa=>{
    if(pa.pageBreak) return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
    const style = pa.head===1? "Heading1" : pa.head===2? "Heading2" : null;
    const runs = pa.runs.map(r=> `<w:r>${(r.bold||pa.head)? "<w:rPr><w:b/></w:rPr>":""}<w:t xml:space="preserve">${xe(r.text)}</w:t></w:r>`).join("");
    return `<w:p>${style? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`:""}${runs}</w:p>`;
  }).join("");
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="360" w:after="160"/></w:pPr><w:rPr><w:b/><w:sz w:val="34"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="280" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="27"/></w:rPr></w:style></w:styles>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const enc = new TextEncoder();
  return H.zipStore([
    { name:"[Content_Types].xml", bytes: enc.encode(contentTypes) },
    { name:"_rels/.rels", bytes: enc.encode(rels) },
    { name:"word/document.xml", bytes: enc.encode(document) },
    { name:"word/styles.xml", bytes: enc.encode(styles) },
    { name:"word/_rels/document.xml.rels", bytes: enc.encode(docRels) }
  ]);
}
Onyx.register({ id:"pdf2word", name:"PDF to Word", icon:"pdf2word", tag:"Converter",
  blurb:"Convert a text-based PDF into an editable .docx — paragraphs and headings rebuilt from the text. Honest best-effort: complex layouts won't be pixel-perfect.",
  keywords:"pdf to word docx convert editable document",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept:".pdf", multiple:false, toolName:"PDF to Word", title:"Drop a PDF here" });
    p.appendChild(dz.element);
    p.appendChild(el("p","small","Works on PDFs that contain real text. For scanned PDFs, run OCR first and paste the text into a document. Layout (columns, tables, exact fonts) is approximated — the words and structure carry over."));
    const { btn, st, outs, showOut } = actionRow(p, "Convert to Word (.docx)");
    btn.onclick = async ()=>{
      const file = dz.getFiles()[0]; if(!file){ st.err("Choose a PDF first."); return; }
      btn.disabled = true; st.say("Converting…");
      try{
        const pages = await extractLines(file, v=> st.prog(v*0.9));
        const paras = [];
        pages.forEach((lines, pi)=>{
          if(pi>0) paras.push({ pageBreak: true });
          let cur = null;
          for(const L of lines){
            const head = L.size >= 19? 1 : L.size >= 14.5? 2 : 0;
            if(head || !cur){ cur = { head, runs: [{ text: L.text, bold: L.bold }] }; paras.push(cur); }
            else cur.runs.push({ text: " ", bold:false }, { text: L.text, bold: L.bold });
          }
        });
        if(!paras.some(x=> x.runs)) throw new Error("No selectable text found in this PDF — it may be a scan. Use the OCR tool instead.");
        const bytes = docxBytes(paras);
        showOut();
        outs.add(H.baseName(file.name)+".docx", new Blob([bytes], {type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}), paras.filter(x=>x.runs).length+" paragraphs");
        st.prog(1); st.ok("Done — open the .docx in Word, Google Docs or LibreOffice.");
      }catch(e){ st.err(e.message||String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= PDF → CSV ================= */
function csvCell(v){ v = String(v==null?"":v); return /[",\n]/.test(v)? '"'+v.replace(/"/g,'""')+'"' : v; }
Onyx.register({ id:"pdf2csv", name:"PDF to CSV / Excel", icon:"pdf2csv", tag:"Converter",
  blurb:"Pull tabular text out of a PDF into a CSV you can open in Excel or Google Sheets. Best-effort column detection.",
  keywords:"pdf to excel csv spreadsheet table extract data rows columns",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept:".pdf", multiple:false, toolName:"PDF to CSV", title:"Drop a PDF here" });
    p.appendChild(dz.element);
    const pageCol = H.checkRow("Add a “Page” column", true); p.appendChild(pageCol.row);
    p.appendChild(el("p","small","Columns are detected from the horizontal positions of the text. Clean, grid-like tables convert best; free-flowing text will come out as one column per line."));
    const { btn, st, outs, showOut } = actionRow(p, "Convert to CSV");
    btn.onclick = async ()=>{
      const file = dz.getFiles()[0]; if(!file){ st.err("Choose a PDF first."); return; }
      btn.disabled = true; st.say("Reading table…");
      try{
        const js = await H.loadPdfJs(file);
        const colStarts = [];
        const pageRows = [];
        for(let i=1;i<=js.numPages;i++){
          const page = await js.getPage(i);
          const tc = await page.getTextContent();
          const items = tc.items.filter(it=> it.str && it.str.trim()).map(it=> ({ text: it.str, x: it.transform[4], y: it.transform[5], w: it.width||0, size: it.height||10 }));
          items.forEach(it=>{ if(!colStarts.some(c=> Math.abs(c - it.x) <= 6)) colStarts.push(it.x); });
          pageRows.push(items); st.prog(i/js.numPages*0.6);
        }
        colStarts.sort((a,b)=> a-b);
        // merge columns that are extremely close across the document
        const cols = colStarts.filter((c, i)=> i===0 || c - colStarts[i-1] > 10);
        const outRows = [];
        pageRows.forEach((items, pi)=>{
          const lines = new Map();
          items.forEach(it=>{ const key = Math.round(it.y/3); if(!lines.has(key)) lines.set(key, []); lines.get(key).push(it); });
          const sorted = [...lines.entries()].sort((a,b)=> b[0]-a[0]);
          sorted.forEach(([, lineItems])=>{
            const cells = new Array(cols.length).fill("");
            lineItems.sort((a,b)=> a.x-b.x).forEach(it=>{
              let ci = 0; for(let k=0;k<cols.length;k++){ if(it.x >= cols[k]-6) ci = k; }
              cells[ci] = cells[ci]? cells[ci]+" "+it.text : it.text;
            });
            while(cells.length && cells[cells.length-1]==="") cells.pop();
            if(cells.some(c=> c)) outRows.push(pageCol.box.checked? [pi+1, ...cells] : cells);
          });
        });
        if(!outRows.length) throw new Error("No text found to tabulate — this may be a scanned PDF (try OCR).");
        const csv = outRows.map(r=> r.map(csvCell).join(",")).join("\r\n");
        showOut(); outs.text(H.baseName(file.name)+".csv", "﻿"+csv, outRows.length+" rows · "+cols.length+" columns detected");
        st.prog(1); st.ok("Done — "+outRows.length+" rows extracted.");
      }catch(e){ st.err(e.message||String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= COMPARE ================= */
function diffLines(a, b){
  // strip common prefix/suffix first for speed
  let start = 0; while(start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while(endA > start && endB > start && a[endA-1] === b[endB-1]){ endA--; endB--; }
  const A = a.slice(start, endA), B = b.slice(start, endB);
  const ops = [];
  for(let i=0;i<start;i++) ops.push({ t:" ", text: a[i] });
  if(A.length * B.length > 9e6){
    A.forEach(t=> ops.push({ t:"-", text: t })); B.forEach(t=> ops.push({ t:"+", text: t }));
  } else if(A.length || B.length){
    const m = A.length, n = B.length;
    const dp = new Uint32Array((m+1)*(n+1));
    for(let i=m-1;i>=0;i--) for(let j=n-1;j>=0;j--) dp[i*(n+1)+j] = A[i]===B[j]? dp[(i+1)*(n+1)+j+1]+1 : Math.max(dp[(i+1)*(n+1)+j], dp[i*(n+1)+j+1]);
    let i=0, j=0;
    while(i<m && j<n){ if(A[i]===B[j]){ ops.push({ t:" ", text: A[i] }); i++; j++; } else if(dp[(i+1)*(n+1)+j] >= dp[i*(n+1)+j+1]){ ops.push({ t:"-", text: A[i] }); i++; } else { ops.push({ t:"+", text: B[j] }); j++; } }
    while(i<m) ops.push({ t:"-", text: A[i++] });
    while(j<n) ops.push({ t:"+", text: B[j++] });
  }
  for(let i=endA;i<a.length;i++) ops.push({ t:" ", text: a[i] });
  return ops;
}
Onyx.register({ id:"compare", name:"Compare PDFs", icon:"compare", tag:"Free here · paid elsewhere",
  blurb:"Diff the text of two PDFs line by line — see exactly what was added, removed or kept between versions.",
  keywords:"compare diff difference versions changes two pdfs",
  mount(root){
    const p = panel(root);
    const cols = el("div","cols");
    const left = el("div"), right = el("div");
    const dzA = H.dropzone({ accept:".pdf", multiple:false, toolName:"Compare PDFs", title:"Drop the ORIGINAL PDF" });
    const dzB = H.dropzone({ accept:".pdf", multiple:false, toolName:"Compare PDFs", title:"Drop the REVISED PDF" });
    left.appendChild(dzA.element); right.appendChild(dzB.element); cols.append(left, right); p.appendChild(cols);
    const { btn, st } = (()=>{ const row = el("div","btn-row"); const b = el("button","btn","Compare Texts"); row.appendChild(b); p.appendChild(row); return { btn: b, st: H.statusBox(p) }; })();
    const stats = el("div","stat-cards mt hidden"); root.appendChild(stats);
    const result = el("div","panel mt hidden"); root.appendChild(result);
    btn.onclick = async ()=>{
      const fa = dzA.getFiles()[0], fb = dzB.getFiles()[0];
      if(!fa || !fb){ st.err("Choose both PDFs."); return; }
      btn.disabled = true; st.say("Extracting and comparing…"); result.classList.add("hidden"); stats.classList.add("hidden");
      try{
        const [pa, pb] = [await extractLines(fa, v=> st.prog(v*0.45)), await extractLines(fb, v=> st.prog(0.5+v*0.45))];
        const linesA = pa.flatMap(L=> L.map(x=> x.text)).filter(Boolean);
        const linesB = pb.flatMap(L=> L.map(x=> x.text)).filter(Boolean);
        const ops = diffLines(linesA, linesB);
        const added = ops.filter(o=> o.t==="+").length, removed = ops.filter(o=> o.t==="-").length, same = ops.filter(o=> o.t===" ").length;
        const sim = (added+removed+same)=== 0? 100 : Math.round(same/Math.max(1, linesA.length)*100);
        stats.innerHTML = "";
        [["Unchanged lines", same, ""], ["Removed (original)", removed, "bad"], ["Added (revised)", added, "good"], ["Text similarity", sim+"%", ""]].forEach(([k,v,c])=>{
          const card = el("div","stat-card"); card.innerHTML = `<div class="k">${esc(k)}</div><div class="v ${c==="bad"?"bad":c==="good"?"good":""}">${esc(String(v))}</div>`; stats.appendChild(card);
        });
        stats.classList.remove("hidden");
        result.innerHTML = "";
        result.appendChild(el("div","section-title","Line-by-line differences"));
        const box = el("div"); box.style.cssText = "font-family:var(--mono);font-size:12.8px;line-height:1.65;max-height:560px;overflow:auto";
        const frag = document.createDocumentFragment();
        ops.slice(0, 4000).forEach(o=>{
          const d = el("div", null, esc((o.t===" "? "   " : o.t==="+"? " + " : " − ") + o.text));
          if(o.t==="+"){ d.style.background = "rgba(52,211,153,.13)"; d.style.color = "var(--text)"; }
          if(o.t==="-"){ d.style.background = "rgba(248,113,113,.13)"; d.style.textDecoration = "line-through"; }
          d.style.padding = "1px 8px"; d.style.borderRadius = "4px";
          frag.appendChild(d);
        });
        box.appendChild(frag); result.appendChild(box);
        if(ops.length > 4000) result.appendChild(el("p","small","Showing the first 4,000 diff rows."));
        result.classList.remove("hidden");
        st.prog(1); st.ok(added+removed === 0? "The documents' text is identical." : "Done — "+removed+" lines removed, "+added+" lines added.");
      }catch(e){ st.err(e.message||String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= WORD / TEXT → PDF ================= */
function decodeXml(s){ return s.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g, (_,n)=> String.fromCharCode(+n)).replace(/&amp;/g,"&"); }
async function docxToParas(bytes){
  const files = await H.unzip(bytes);
  const docXml = files.get("word/document.xml");
  if(!docXml) throw new Error("This doesn't look like a valid .docx file (word/document.xml missing).");
  const xml = new TextDecoder().decode(docXml);
  const paras = [];
  const pMatches = xml.match(/<w:p[\s>][\s\S]*?<\/w:p>|<w:p\/>/g) || [];
  for(const pxml of pMatches){
    const styleM = pxml.match(/<w:pStyle w:val="([^"]+)"/);
    const style = styleM? styleM[1] : "";
    const head = /Heading1|Title/i.test(style)? 1 : /Heading2/i.test(style)? 2 : 0;
    const isList = /<w:numPr>/.test(pxml);
    const runs = [];
    const rMatches = pxml.match(/<w:r[\s>][\s\S]*?<\/w:r>/g) || [];
    for(const rxml of rMatches){
      const bold = /<w:b\/>|<w:b [^>]*w:val="true"/.test(rxml);
      const italic = /<w:i\/>|<w:i [^>]*w:val="true"/.test(rxml);
      const tMatches = rxml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
      const text = tMatches.map(t=> decodeXml(t.replace(/<[^>]+>/g, ""))).join("");
      if(text) runs.push({ text, bold, italic });
    }
    const full = runs.map(r=> r.text).join("");
    if(full.trim() || head) paras.push({ text: (isList? "• " : "") + full, head, bold: runs.length>0 && runs.every(r=> r.bold) });
  }
  return paras;
}
Onyx.register({ id:"word2pdf", name:"Word / Text to PDF", icon:"word2pdf", tag:"Converter",
  blurb:"Turn a .docx or .txt into a clean PDF — headings, bold and lists carried over. Basic formatting, honestly done.",
  keywords:"word docx txt text to pdf convert document",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept:".docx,.txt", multiple:false, toolName:"Word/Text to PDF", title:"Drop a .docx or .txt file",
      hint:"Legacy .doc (binary Word 97-2003) isn't supported — save it as .docx first." });
    p.appendChild(dz.element);
    let font = H.setting("word2pdf","font","helvetica");
    p.appendChild(H.field("Font", H.radioRow([{value:"helvetica",label:"Helvetica (clean)"},{value:"times",label:"Times (classic)"}], font, v=>{ font=v; H.setSetting("word2pdf","font",v); })));
    const { btn, st, outs, showOut } = actionRow(p, "Convert to PDF");
    btn.onclick = async ()=>{
      const file = dz.getFiles()[0]; if(!file){ st.err("Choose a .docx or .txt file."); return; }
      btn.disabled = true; st.say("Converting…");
      try{
        let paras;
        if(/\.docx$/i.test(file.name)){
          paras = await docxToParas(await H.fileBytes(file));
        } else {
          const text = await file.text();
          paras = text.split(/\n\s*\n/).map(t=> ({ text: t.replace(/\s*\n\s*/g, " ").trim(), head: 0, bold: false })).filter(x=> x.text);
        }
        if(!paras.length) throw new Error("No readable text found in that file.");
        const { PDFDocument } = window.PDFLib;
        const doc = await PDFDocument.create();
        const F = font === "times"
          ? { body: await doc.embedFont(StandardFonts.TimesRoman), bold: await doc.embedFont(StandardFonts.TimesRomanBold) }
          : { body: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
        const PW = 595.28, PH = 841.89, M = 56, CW = PW - M*2;
        let page = doc.addPage([PW, PH]); let y = PH - M;
        const newPage = ()=>{ page = doc.addPage([PW, PH]); y = PH - M; };
        const wrap = (text, fnt, size)=>{
          const words = text.split(/\s+/); const lines = []; let line = "";
          for(const w of words){
            const trial = line? line+" "+w : w;
            if(fnt.widthOfTextAtSize(trial, size) > CW && line){ lines.push(line); line = w; } else line = trial;
          }
          if(line) lines.push(line); return lines;
        };
        for(const pa of paras){
          const size = pa.head===1? 21 : pa.head===2? 16 : 11.5;
          const fnt = (pa.head || pa.bold)? F.bold : F.body;
          const lines = wrap(pa.text || " ", fnt, size);
          const lh = size * 1.4;
          if(y - lines.length*lh < M) newPage();
          for(const ln of lines){ if(y < M + lh) newPage(); page.drawText(ln, { x: M, y: y - size, size, font: fnt }); y -= lh; }
          y -= pa.head? 8 : 5;
        }
        showOut(); outs.add(H.baseName(file.name)+".pdf", await doc.save({ useObjectStreams: true }), paras.length+" paragraphs");
        st.ok("Done.");
      }catch(e){ st.err(e.message||String(e)); }
      btn.disabled = false;
    };
  }
});
})();
