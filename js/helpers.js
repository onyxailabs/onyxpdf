/* OnyxPDF — shared helpers. Everything runs locally; storage is localStorage only. */
(function(){
"use strict";
const { PDFDocument } = window.PDFLib;
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";

const $ = (s, r)=> (r||document).querySelector(s);
const $$ = (s, r)=> Array.from((r||document).querySelectorAll(s));
function el(tag, cls, html){ const e=document.createElement(tag); if(cls) e.className=cls; if(html!=null) e.innerHTML=html; return e; }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

/* ---------- local storage ---------- */
const store = {
  get(k, def){ try{ const v = localStorage.getItem("onyxpdf:"+k); return v==null? def : JSON.parse(v); }catch(e){ return def; } },
  set(k, v){ try{ localStorage.setItem("onyxpdf:"+k, JSON.stringify(v)); }catch(e){} }
};
const setting = (tool, key, def)=> store.get("set:"+tool+":"+key, def);
const setSetting = (tool, key, v)=> store.set("set:"+tool+":"+key, v);

/* ---------- recents & favorites (names/metadata only, never file data) ---------- */
function addRecent(name, tool){ const r = store.get("recents", []); r.unshift({name, tool, t: Date.now()}); store.set("recents", r.slice(0,12)); if(window.Onyx) Onyx.renderRecents(); }
function recents(){ return store.get("recents", []); }
function clearRecents(){ store.set("recents", []); if(window.Onyx) Onyx.renderRecents(); }
function favs(){ return store.get("favs", []); }
function toggleFav(id){ let f = favs(); f = f.includes(id)? f.filter(x=>x!==id) : [...f, id]; store.set("favs", f); return f.includes(id); }

/* ---------- toast / status / progress ---------- */
let toastTimer=null;
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.add("on"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove("on"), 3200); }
function statusBox(root){
  const s = el("div","status"); const p = el("div","progress"); p.appendChild(el("i"));
  root.appendChild(s); root.appendChild(p);
  return {
    say(msg, kind){ s.textContent = msg||""; s.className = "status"+(kind?" "+kind:""); },
    err(msg){ this.say(msg, "err"); this.prog(-1); },
    ok(msg){ this.say(msg, "ok"); },
    prog(v){ if(v==null||v<0){ p.classList.remove("on"); return; } p.classList.add("on"); p.firstChild.style.width = Math.round(Math.max(0,Math.min(1,v))*100)+"%"; if(v>=1) setTimeout(()=>p.classList.remove("on"), 600); }
  };
}

/* ---------- downloads ---------- */
function download(blob, name){ const url = URL.createObjectURL(blob); const a = el("a"); a.href=url; a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 800); }
function downloadBytes(bytes, name, mime){ download(new Blob([bytes], {type: mime||"application/pdf"}), name); }
function baseName(name){ return (name||"document").replace(/\.(pdf|docx?|xlsx?|csv|txt|png|jpe?g)$/i, ""); }
function fmtBytes(n){ if(n==null||isNaN(n)) return "—"; const u=["B","KB","MB","GB"]; let i=0; while(n>=1024&&i<3){ n/=1024; i++; } return n.toFixed(n>=100||i===0?0:1)+" "+u[i]; }

/* ---------- files ---------- */
const fileBytes = async f => new Uint8Array(await f.arrayBuffer());
async function loadPdf(fileOrBytes){
  const bytes = fileOrBytes instanceof Uint8Array ? fileOrBytes : await fileBytes(fileOrBytes);
  try { return await PDFDocument.load(bytes, { ignoreEncryption: false }); }
  catch(e){ if(/encrypt/i.test(e.message||"")) throw new Error("This PDF is password-protected. Remove the password first (Unlock tool) and try again."); throw e; }
}
async function loadPdfJs(fileOrBytes, password){
  const bytes = fileOrBytes instanceof Uint8Array ? fileOrBytes : await fileBytes(fileOrBytes);
  return pdfjsLib.getDocument({ data: bytes.slice(), password: password||undefined }).promise;
}
async function renderPage(pdfJsDoc, pageNo, scale){
  const page = await pdfJsDoc.getPage(pageNo);
  const vp = page.getViewport({ scale });
  const c = el("canvas"); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
  return { canvas: c, page, viewport: vp };
}
function canvasToBytes(canvas, type, q){
  return new Promise(res=> canvas.toBlob(async b=> res(new Uint8Array(await b.arrayBuffer())), type, q));
}

/* ---------- page range parsing: "1-3, 5, 8-" (1-based) ---------- */
function parseRanges(str, max){
  const out = []; const seen = new Set();
  const parts = String(str||"").split(",").map(s=>s.trim()).filter(Boolean);
  if(!parts.length) throw new Error("Enter at least one page or range, e.g. 1-3, 5.");
  for(const p of parts){
    const m = p.match(/^(\d+)\s*-\s*(\d*)$/); const single = p.match(/^(\d+)$/);
    let a, b;
    if(m){ a = +m[1]; b = m[2]===""? max : +m[2]; }
    else if(single){ a = b = +single[1]; }
    else throw new Error("Could not understand “"+p+"”. Use pages like 1-3, 5, 8-10.");
    if(a<1 || b<1 || a>max || b>max) throw new Error("Page "+(a>max?a:b)+" is out of range — the document has "+max+" pages.");
    if(b<a) [a,b] = [b,a];
    for(let i=a;i<=b;i++){ if(!seen.has(i-1)){ seen.add(i-1); out.push(i-1); } }
  }
  return out;
}

/* ---------- dropzone component ---------- */
function dropzone(opts){
  const wrap = el("div");
  const dz = el("div","dropzone");
  dz.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M12 16V4m0 0l-4 4m4-4l4 4"/><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"/></svg>
    <div class="big">${esc(opts.title||"Drop files here")}</div>
    <div class="small">${esc(opts.hint||"Files are processed on your device — nothing is uploaded.")}</div>`;
  const browse = el("button","btn sm browse","Browse files"); browse.type="button"; dz.appendChild(browse);
  const input = el("input"); input.type="file"; input.accept = opts.accept||".pdf"; if(opts.multiple!==false) input.multiple=true; input.className="hidden";
  const list = el("div","file-list");
  wrap.appendChild(dz); wrap.appendChild(input); wrap.appendChild(list);
  let files = [];
  function render(){
    list.innerHTML="";
    files.forEach((f, i)=>{
      const item = el("div","file-item"); item.draggable = !!opts.reorderable;
      item.innerHTML = `<span class="fname" title="${esc(f.name)}">${esc(f.name)}</span><span class="fsize">${fmtBytes(f.size)}</span>`;
      if(opts.reorderable){
        const up = el("button","mv","↑"); up.title="Move up"; up.onclick=()=>{ if(i>0){ [files[i-1],files[i]]=[files[i],files[i-1]]; render(); changed(); } };
        const dn = el("button","mv","↓"); dn.title="Move down"; dn.onclick=()=>{ if(i<files.length-1){ [files[i+1],files[i]]=[files[i],files[i+1]]; render(); changed(); } };
        item.appendChild(up); item.appendChild(dn);
        item.addEventListener("dragstart", e=>{ item.classList.add("dragging"); e.dataTransfer.setData("text/plain", String(i)); });
        item.addEventListener("dragend", ()=> item.classList.remove("dragging"));
        item.addEventListener("dragover", e=> e.preventDefault());
        item.addEventListener("drop", e=>{ e.preventDefault(); const from = +e.dataTransfer.getData("text/plain"); if(!isNaN(from)&&from!==i){ const [m]=files.splice(from,1); files.splice(i,0,m); render(); changed(); } });
      }
      const rm = el("button","rm","×"); rm.title="Remove"; rm.onclick=()=>{ files.splice(i,1); render(); changed(); };
      item.appendChild(rm); list.appendChild(item);
    });
  }
  function changed(){ if(opts.onChange) opts.onChange(files.slice()); }
  function add(newFiles){
    const arr = Array.from(newFiles||[]);
    if(opts.multiple===false && arr.length) files = [arr[0]]; else files = files.concat(arr);
    render(); changed();
    if(arr.length && opts.toolName) addRecent(arr[0].name, opts.toolName);
  }
  browse.onclick = ()=> input.click();
  dz.onclick = e=>{ if(e.target===dz||e.target.closest(".big,.small,svg")) input.click(); };
  input.onchange = ()=>{ add(input.files); input.value=""; };
  ["dragenter","dragover"].forEach(ev=> dz.addEventListener(ev, e=>{ e.preventDefault(); dz.classList.add("drag"); }));
  ["dragleave","drop"].forEach(ev=> dz.addEventListener(ev, e=>{ e.preventDefault(); dz.classList.remove("drag"); }));
  dz.addEventListener("drop", e=> add(e.dataTransfer.files));
  return { element: wrap, getFiles: ()=> files.slice(), clear(){ files=[]; render(); changed(); }, add };
}

/* ---------- output list ---------- */
function outputList(){
  const box = el("div","out-list");
  return {
    element: box,
    clear(){ box.innerHTML=""; },
    add(name, blobOrBytes, note){
      const row = el("div","out-item");
      const blob = blobOrBytes instanceof Blob ? blobOrBytes : new Blob([blobOrBytes], {type:"application/pdf"});
      row.innerHTML = `<span class="fname" title="${esc(name)}">${esc(name)}</span>${note?`<span class="fsize">${esc(note)}</span>`:""}<span class="fsize">${fmtBytes(blob.size)}</span>`;
      const b = el("button","dl-btn","Download"); b.onclick=()=> download(blob, name);
      row.appendChild(b); box.appendChild(row); return row;
    },
    text(name, text, note){
      return this.add(name, new Blob([text], {type:"text/plain;charset=utf-8"}), note);
    }
  };
}

/* ---------- option widgets ---------- */
function radioRow(options, current, onPick){
  const row = el("div","radio-row");
  options.forEach(o=>{
    const b = el("button","radio-chip"+(o.value===current?" active":""), esc(o.label)); b.type="button";
    b.onclick=()=>{ $$(".radio-chip", row).forEach(x=>x.classList.remove("active")); b.classList.add("active"); onPick(o.value); };
    row.appendChild(b);
  });
  return row;
}
function field(label, control, hint){
  const f = el("div","field"); const l = el("label", null, esc(label)); f.appendChild(l); f.appendChild(control);
  if(hint){ const h = el("div","hint", esc(hint)); f.appendChild(h); }
  return f;
}
function textInput(val, placeholder){ const i = el("input"); i.type="text"; i.value = val||""; if(placeholder) i.placeholder=placeholder; return i; }
function numInput(val, min, max, step){ const i = el("input"); i.type="number"; i.value = val; if(min!=null) i.min=min; if(max!=null) i.max=max; if(step!=null) i.step=step; return i; }
function selectInput(pairs, val){ const s = el("select"); pairs.forEach(([v,t])=>{ const o = el("option", null, esc(t)); o.value=v; if(v===val) o.selected=true; s.appendChild(o); }); return s; }
function slider(val, min, max, step){ const i = el("input"); i.type="range"; i.min=min; i.max=max; i.step=step||1; i.value=val; return i; }
function checkRow(labelText, checked){
  const l = el("label","check"); const c = el("input"); c.type="checkbox"; c.checked=!!checked;
  l.appendChild(c); l.appendChild(el("span", null, esc(labelText))); return { row: l, box: c };
}

/* ---------- minimal ZIP writer (stored entries) + reader — for .docx/.xlsx ---------- */
const CRC_TABLE = (()=>{ const t=[]; for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = c&1? 0xEDB88320^(c>>>1) : c>>>1; t[n]=c>>>0; } return t; })();
function crc32(u8){ let c=0xFFFFFFFF; for(let i=0;i<u8.length;i++) c = CRC_TABLE[(c^u8[i])&0xFF]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
function zipStore(files){ // files: [{name, bytes:Uint8Array}] -> Uint8Array (stored, no compression — Office accepts this)
  const enc = new TextEncoder(); let offset=0; const chunks=[]; const central=[];
  for(const f of files){
    const name = enc.encode(f.name); const crc = crc32(f.bytes);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, 0, true); lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, f.bytes.length, true); lh.setUint32(22, f.bytes.length, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    chunks.push(new Uint8Array(lh.buffer), name, f.bytes);
    central.push({ name, crc, size: f.bytes.length, offset }); offset += 30 + name.length + f.bytes.length;
  }
  const cdStart = offset;
  for(const c of central){
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true);
    ch.setUint32(16, c.crc, true); ch.setUint32(20, c.size, true); ch.setUint32(24, c.size, true);
    ch.setUint16(28, c.name.length, true); ch.setUint32(42, c.offset, true);
    chunks.push(new Uint8Array(ch.buffer), c.name); offset += 46 + c.name.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, central.length, true); end.setUint16(10, central.length, true);
  end.setUint32(12, offset-cdStart, true); end.setUint32(16, cdStart, true);
  chunks.push(new Uint8Array(end.buffer));
  const total = chunks.reduce((s,c)=>s+c.length,0); const out = new Uint8Array(total); let p=0;
  for(const c of chunks){ out.set(c, p); p += c.length; }
  return out;
}
async function unzip(bytes){ // -> Map<name, Uint8Array>; supports stored + deflate (via DecompressionStream)
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1; for(let i = bytes.length-22; i >= 0; i--){ if(dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; } }
  if(eocd < 0) throw new Error("Not a valid ZIP/Office file.");
  const count = dv.getUint16(eocd+10, true); let p = dv.getUint32(eocd+16, true);
  const map = new Map();
  for(let n=0;n<count;n++){
    if(dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p+10, true); const csize = dv.getUint32(p+20, true);
    const nlen = dv.getUint16(p+28, true); const elen = dv.getUint16(p+30, true); const clen = dv.getUint16(p+32, true);
    const lho = dv.getUint32(p+42, true);
    const name = new TextDecoder().decode(bytes.slice(p+46, p+46+nlen));
    const lnlen = dv.getUint16(lho+26, true); const lelen = dv.getUint16(lho+28, true);
    const data = bytes.slice(lho+30+lnlen+lelen, lho+30+lnlen+lelen+csize);
    if(method === 0) map.set(name, data);
    else if(method === 8){
      if(typeof DecompressionStream === "undefined") throw new Error("This browser cannot decompress Office files.");
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      map.set(name, new Uint8Array(await new Response(stream).arrayBuffer()));
    }
    p += 46 + nlen + elen + clen;
  }
  return map;
}

/* pdf-lib standard fonts use WinAnsi encoding — text outside it throws. Map common
   typography, keep Latin-1, replace the rest with "?" so stamping never crashes. */
function safeWinAnsi(s){
  return String(s||"")
    .replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,"-")
    .replace(/…/g,"...").replace(/[•·]/g,"-").replace(/[^\x20-\x7E\xA0-\xFF€]/g,"?");
}

window.H = { $, $$, el, esc, store, setting, setSetting, addRecent, recents, clearRecents, favs, toggleFav, safeWinAnsi,
  toast, statusBox, download, downloadBytes, baseName, fmtBytes, fileBytes, loadPdf, loadPdfJs, renderPage,
  canvasToBytes, parseRanges, dropzone, outputList, radioRow, field, textInput, numInput, selectInput, slider,
  checkRow, zipStore, unzip, crc32 };
})();
