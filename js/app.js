/* OnyxPDF — shell: registry, grid, search, pins, recents, theming, routing. */
(function(){
"use strict";
const { $, $$, el, esc, store, favs, toggleFav, recents, clearRecents, toast } = window.H;

const ICONS = {
  merge:'<path d="M8 3v6a5 5 0 005 5h5m0 0l-3-3m3 3l-3 3M8 3L5 6m3-3l3 3"/>',
  split:'<circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M8.2 7.8L20 19M8.2 16.2L20 5"/>',
  compress:'<path d="M9 4L4 9m0-5v5h5M15 20l5-5m0 5v-5h-5M4 15l5 5m-5 0h5v-5M20 9l-5-5m5 0h-5v5" transform="translate(0,0) scale(0.95)"/>',
  rotate:'<path d="M20.5 12a8.5 8.5 0 11-2.5-6"/><path d="M21 3v4.5h-4.5"/>',
  organize:'<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  crop:'<path d="M6 2v13a3 3 0 003 3h13M2 6h13a3 3 0 013 3v13"/>',
  resize:'<path d="M9 4H4v5M15 20h5v-5M4 4l6 6M20 20l-6-6"/>',
  nup:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18M3 12h18"/>',
  pdf2img:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-4.5-4.5a1.8 1.8 0 00-2.5 0L7 18.5"/>',
  img2pdf:'<path d="M6 2.5h8L19 7.5v14H6z"/><path d="M14 2.5v5h5"/><circle cx="10" cy="13" r="1.4"/><path d="M18 18l-2.6-2.6a1.4 1.4 0 00-2 0L9 19.5"/>',
  watermark:'<path d="M12 3c3.5 4.2 6 7.6 6 10.5A6 6 0 016 13.5C6 10.6 8.5 7.2 12 3z"/>',
  pagenum:'<path d="M9 4L7 20M17 4l-2 16M4 9h17M3 15h17"/>',
  headerfooter:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8.5h18M3 15.5h18"/>',
  bates:'<path d="M10 5L8.2 19M15.8 5L14 19M4.5 9h16M4 15h16"/>',
  extract:'<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h6M9 16h6"/>',
  ocr:'<path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2"/><path d="M7.5 15.5l2-6 2 6M8.2 13.6h2.6M14.5 15.5c.6-1 2.6-1 2.6 1s-2 2-2.6 1"/>',
  scan:'<path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2"/><path d="M4 12h16"/>',
  sign:'<path d="M3 17.5c2.5.5 4-8.5 6-8.5 1.7 0 .6 6.5 2.6 6.5 1.6 0 2-3.5 3.4-3.5 1 0 1.2 2 .5 3.5M4 21h16"/>',
  edit:'<path d="M16.5 4.5l3 3L8 19l-4 1 1-4L16.5 4.5z"/><path d="M14.5 6.5l3 3"/>',
  annotate:'<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1z"/><path d="M3 22h18" opacity=".0"/><path d="M14 7l3 3M3 21.5h13"/>',
  fillform:'<path d="M5 3h14v18H5z"/><path d="M8.5 8h7M8.5 12h7"/><path d="M8.7 16.4l1.3 1.3 2.3-2.6"/>',
  pdf2word:'<path d="M6 2.5h8L19 7.5v14H6z"/><path d="M14 2.5v5h5"/><path d="M8.5 11l1.2 6 1.6-4.4 1.6 4.4 1.2-6"/>',
  pdf2csv:'<rect x="3.5" y="4" width="17" height="16" rx="1.5"/><path d="M3.5 9.3h17M3.5 14.6h17M9.2 4v16M14.8 4v16"/>',
  word2pdf:'<path d="M6 2.5h8L19 7.5v14H6z"/><path d="M14 2.5v5h5"/><path d="M9 17.5h6M12 12v5.5m0 0L9.8 15.4M12 17.5l2.2-2.1"/>',
  compare:'<path d="M8 4H5a1 1 0 00-1 1v14a1 1 0 001 1h3M16 4h3a1 1 0 011 1v14a1 1 0 01-1 1h-3M12 3v18"/>',
  redact:'<rect x="3.5" y="6" width="17" height="12" rx="1.5" fill="currentColor" stroke="none" opacity=".9"/><path d="M4 4L20 20" stroke="var(--bg)"/>',
  flatten:'<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  grayscale:'<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 010 17z" fill="currentColor" stroke="none"/>',
  pdfinfo:'<circle cx="12" cy="12" r="8.8"/><path d="M12 11v5"/><circle cx="12" cy="8" r="0.6" fill="currentColor"/>',
  metadata:'<path d="M3.5 12L12 3.5H20.5V12L12 20.5z"/><circle cx="16.5" cy="8" r="1.6"/>',
  protect:'<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/><circle cx="12" cy="15.2" r="1.5"/>',
  unlock:'<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 017.8-1.3"/><circle cx="12" cy="15.2" r="1.5"/>',
  imgcompress:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v5H4M15 20v-5h5M4 9h5M15 15h5" transform="scale(0.96)"/>',
  imgresize:'<path d="M4 9V4h5M20 15v5h-5"/><rect x="8.5" y="8.5" width="7" height="7" rx="1"/>',
  imgconvert:'<path d="M7 4L3 8l4 4"/><path d="M3 8h13"/><path d="M17 20l4-4-4-4"/><path d="M21 16H8"/>',
  imgcrop:'<path d="M6 2v13a3 3 0 003 3h13M2 6h13a3 3 0 013 3v13"/>',
  imgrotate:'<path d="M20.5 12a8.5 8.5 0 11-2.5-6"/><path d="M21 3v4.5h-4.5"/><rect x="8.6" y="8.6" width="6.8" height="6.8" rx="1"/>',
  imgwatermark:'<path d="M12 3c3.5 4.2 6 7.6 6 10.5A6 6 0 016 13.5C6 10.6 8.5 7.2 12 3z"/><path d="M9.6 13.6a2.5 2.5 0 002.5 2.4"/>',
  imgedit:'<path d="M4 7h8M18 7h2M4 12h2M12 12h8M4 17h10M20 17h-2"/><circle cx="15" cy="7" r="2.1"/><circle cx="9" cy="12" r="2.1"/><circle cx="17" cy="17" r="2.1"/>',
  imgtext:'<path d="M5 5h14M12 5v13"/><path d="M9 21h6"/>',
  passport:'<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M7.6 18c.8-2.1 2.4-3.1 4.4-3.1s3.6 1 4.4 3.1"/>',
  heic:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M6.5 9v6M6.5 12h3M9.5 9v6M13 9h3.5M13 12h2.6M13 15h3.5M18.5 9.5a2.8 2.8 0 100 5.5"/>',
  collage:'<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
  splitimg:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  circlecrop:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/>',
  svg:'<path d="M8.5 4L4 12l4.5 8M15.5 4L20 12l-4.5 8"/>',
  favicon:'<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8L12 3z"/>',
  palette:'<circle cx="12" cy="12" r="8.5"/><circle cx="9" cy="9.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.8" cy="8.8" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.2" cy="14.2" r="1.2" fill="currentColor" stroke="none"/><path d="M12 20.5c4.7 0 8.5-3.8 8.5-8.5"/>',
  blur:'<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1" opacity=".45"/><rect x="4" y="13" width="7" height="7" rx="1" opacity=".45"/><rect x="13" y="13" width="7" height="7" rx="1" opacity=".2"/>',
  bgremove:'<circle cx="10.5" cy="7.8" r="3.1"/><path d="M4.6 19.6c.7-3 3-4.7 5.9-4.7 1.5 0 2.9.5 3.9 1.4"/><path d="M17.8 3.2l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/><path d="M20.4 10.4l.45 1.3 1.3.45-1.3.45-.45 1.3-.45-1.3-1.3-.45 1.3-.45z"/>'
};
const FALLBACK_ICON = ICONS.pdfinfo;

const tools = [];
function register(tool){ tools.push(tool); }
function byId(id){ return tools.find(t=>t.id===id); }

/* Static-page routing (SEO): each tool has a real page at <slug>/ (see
   js/seo-slugs.js, generated by tools/generate-seo-pages.mjs). Cards are real
   anchors so crawlers, sharing and middle-clicks get the static URL; a plain
   click is enhanced into the in-app open when JS is running. */
function appBase(){ return (document.body && document.body.dataset.appBase) || "./"; }
function slugOf(id){ const m = window.ONYX_SLUGS || {}; return m[id] || null; }
function toolHref(id){ const s = slugOf(id); return s? appBase() + s + "/" : "#"; }
function idBySlug(slug){ const m = window.ONYX_SLUGS || {}; for(const k in m) if(m[k]===slug) return k; return null; }

function card(tool){
  const c = el("a","tool-card");
  c.href = toolHref(tool.id);
  const pinned = favs().includes(tool.id);
  c.innerHTML = `<div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[tool.icon]||FALLBACK_ICON}</svg></div>
    <h3>${esc(tool.name)}</h3><p>${esc(tool.blurb)}</p>${tool.tag?`<span class="tag">${esc(tool.tag)}</span>`:""}`;
  const pin = el("button","pin-btn"+(pinned?" pinned":""), '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8L12 3z"/></svg>');
  pin.title = pinned? "Unpin" : "Pin to top"; pin.setAttribute("aria-label", pin.title);
  pin.onclick = e=>{ e.preventDefault(); e.stopPropagation(); const now = toggleFav(tool.id); pin.classList.toggle("pinned", now); pin.title = now? "Unpin":"Pin to top"; renderGrid($("#tool-search").value); toast(now? tool.name+" pinned to the top" : tool.name+" unpinned"); };
  c.appendChild(pin);
  c.onclick = e=>{ if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey) return; e.preventDefault(); openTool(tool.id); };
  return c;
}
function renderGrid(filter){
  const q = (filter||"").trim().toLowerCase();
  const match = t => !q || (t.name+" "+t.blurb+" "+(t.keywords||"")).toLowerCase().includes(q);
  const all = $("#grid-all"); all.innerHTML = "";
  const imgGrid = $("#grid-image"); if(imgGrid) imgGrid.innerHTML = "";
  const favList = tools.filter(t=> favs().includes(t.id) && match(t));
  const rest = tools.filter(t=> match(t));
  const pdfRest = rest.filter(t=> t.section !== "image");
  const imgRest = rest.filter(t=> t.section === "image");
  pdfRest.forEach(t=> all.appendChild(card(t)));
  imgRest.forEach(t=> { if(imgGrid) imgGrid.appendChild(card(t)); });
  if(!rest.length) all.appendChild(el("div","empty-note","No tools match “"+esc(q)+"”. Try a different word."));
  $("#tool-count").textContent = "· "+pdfRest.length+" tools";
  const ic = $("#image-count"); if(ic) ic.textContent = "· "+imgRest.length+" tools";
  const it = $("#image-section-title"); if(it) it.classList.toggle("hidden", !imgRest.length);
  const pw = $("#pinned-wrap"), pg = $("#grid-pinned"); pg.innerHTML = "";
  if(favList.length){ pw.classList.remove("hidden"); favList.forEach(t=> pg.appendChild(card(t))); }
  else pw.classList.add("hidden");
}
function renderRecents(){
  const wrap = $("#recents-wrap"), box = $("#recents"); const r = recents();
  if(!r.length){ wrap.classList.add("hidden"); return; }
  wrap.classList.remove("hidden"); box.innerHTML = "";
  r.forEach(x=>{
    const d = new Date(x.t);
    box.appendChild(el("span","recent-chip", `<b>${esc(x.name)}</b> · ${esc(x.tool)} · ${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`));
  });
  const clr = el("button","clear-btn","Clear list"); clr.onclick = ()=>{ clearRecents(); toast("Recent list cleared"); };
  box.appendChild(clr);
}

let currentTool = null;
function openTool(id){
  const t = byId(id); if(!t) return;
  currentTool = t;
  $("#view-home").classList.add("hidden"); $("#view-tool").classList.remove("hidden");
  $("#tool-title").textContent = t.name; $("#tool-blurb").textContent = t.blurb;
  const root = $("#tool-root"); root.innerHTML = "";
  window.scrollTo({ top: 0 });
  try { t.mount(root); } catch(e){ root.innerHTML = ""; const p = el("div","panel"); p.innerHTML = `<div class="status err">This tool failed to start: ${esc(e.message||e)}</div>`; root.appendChild(p); }
}
function goHome(){
  currentTool = null;
  $("#view-tool").classList.add("hidden"); $("#view-home").classList.remove("hidden");
  $("#tool-root").innerHTML = "";
  renderGrid($("#tool-search").value); renderRecents();
  window.scrollTo({ top: 0 });
}

/* ---------- theming ---------- */
const ACCENTS = {
  cyan:   ["#22d3ee", "#0ea5c6", "rgba(34,211,238,.14)"],
  violet: ["#a78bfa", "#8b5cf6", "rgba(167,139,250,.16)"],
  emerald:["#34d399", "#10b981", "rgba(52,211,153,.15)"],
  amber:  ["#fbbf24", "#f59e0b", "rgba(251,191,36,.15)"]
};
function applyTheme(){
  const mode = store.get("theme:mode", "dark");
  const accent = store.get("theme:accent", "cyan");
  document.documentElement.setAttribute("data-theme", mode);
  const a = ACCENTS[accent] || ACCENTS.cyan;
  const r = document.documentElement.style;
  r.setProperty("--accent", a[0]); r.setProperty("--accent-strong", a[1]); r.setProperty("--accent-soft", a[2]);
  $$(".accent-dot").forEach(d=> d.classList.toggle("active", d.dataset.accent===accent));
  $("#mode-toggle").textContent = mode==="dark"? "☀ Light" : "☾ Dark";
}
function init(){
  applyTheme();
  $$(".accent-dot").forEach(d=> d.onclick = ()=>{ store.set("theme:accent", d.dataset.accent); applyTheme(); });
  $("#mode-toggle").onclick = ()=>{ const m = store.get("theme:mode","dark")==="dark"? "light":"dark"; store.set("theme:mode", m); applyTheme(); };
  $("#tool-search").addEventListener("input", e=> renderGrid(e.target.value));
  $("#btn-back").onclick = goHome;
  $("#brand-home").onclick = e=>{ e.preventDefault(); goHome(); };
  renderGrid(""); renderRecents();
  /* Static tool pages land here with the tool pre-opened: the generated page
     carries data-open-tool="<id>" on <body>; the path segment is a fallback. */
  let openId = (document.body && document.body.dataset.openTool) || null;
  if(!openId){
    const seg = location.pathname.split("/").filter(Boolean).pop() || "";
    openId = idBySlug(seg);
  }
  if(openId && byId(openId)) openTool(openId);
}
document.addEventListener("DOMContentLoaded", init);

window.Onyx = { register, openTool, goHome, renderRecents, tools, ICONS };
})();
