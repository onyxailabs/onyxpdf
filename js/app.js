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
  unlock:'<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 017.8-1.3"/><circle cx="12" cy="15.2" r="1.5"/>'
};
const FALLBACK_ICON = ICONS.pdfinfo;

const tools = [];
function register(tool){ tools.push(tool); }
function byId(id){ return tools.find(t=>t.id===id); }

function card(tool){
  const c = el("div","tool-card"); c.tabIndex = 0; c.setAttribute("role","button");
  const pinned = favs().includes(tool.id);
  c.innerHTML = `<div class="ic"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[tool.icon]||FALLBACK_ICON}</svg></div>
    <h3>${esc(tool.name)}</h3><p>${esc(tool.blurb)}</p>${tool.tag?`<span class="tag">${esc(tool.tag)}</span>`:""}`;
  const pin = el("button","pin-btn"+(pinned?" pinned":""), '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8L12 3z"/></svg>');
  pin.title = pinned? "Unpin" : "Pin to top"; pin.setAttribute("aria-label", pin.title);
  pin.onclick = e=>{ e.stopPropagation(); const now = toggleFav(tool.id); pin.classList.toggle("pinned", now); pin.title = now? "Unpin":"Pin to top"; renderGrid($("#tool-search").value); toast(now? tool.name+" pinned to the top" : tool.name+" unpinned"); };
  c.appendChild(pin);
  c.onclick = ()=> openTool(tool.id);
  c.onkeydown = e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); openTool(tool.id); } };
  return c;
}
function renderGrid(filter){
  const q = (filter||"").trim().toLowerCase();
  const match = t => !q || (t.name+" "+t.blurb+" "+(t.keywords||"")).toLowerCase().includes(q);
  const all = $("#grid-all"); all.innerHTML = "";
  const favList = tools.filter(t=> favs().includes(t.id) && match(t));
  const rest = tools.filter(t=> match(t));
  rest.forEach(t=> all.appendChild(card(t)));
  if(!rest.length) all.appendChild(el("div","empty-note","No tools match “"+esc(q)+"”. Try a different word."));
  $("#tool-count").textContent = "· "+rest.length+" tools";
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
}
document.addEventListener("DOMContentLoaded", init);

window.Onyx = { register, openTool, goHome, renderRecents, tools, ICONS };
})();
