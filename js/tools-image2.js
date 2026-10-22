/* OnyxPDF — image tools II: Combine, Split, Circle/Rounded, SVG→PNG, Favicon,
   Colour Palette, Blur & Pixelate. All canvas-based, 100% on-device. */
(function(){
"use strict";
const H = window.H, { el, esc } = H;
const I = window.ImgH;
const { loadImg, mkCanvas, drawTo, encode } = I;
const IMG_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/bmp";

function panel(root){ const p = el("div","panel"); root.appendChild(p); return p; }
function actionRow(parent, label){
  const row = el("div","btn-row"); const btn = el("button","btn", esc(label)); row.appendChild(btn); parent.appendChild(row);
  const st = H.statusBox(parent);
  const outPanel = el("div","panel"); outPanel.classList.add("hidden");
  const outs = H.outputList(); outPanel.appendChild(outs.element); parent.parentNode.appendChild(outPanel);
  return { btn, st, outs, showOut(){ outPanel.classList.remove("hidden"); } };
}

/* ================= COMBINE / COLLAGE ================= */
Onyx.register({ id:"img-combine", name:"Combine Images", icon:"collage", section:"image",
  blurb:"Stitch photos into one grid collage — choose columns, spacing and background colour.",
  keywords:"combine collage grid merge images together photo grid",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept: IMG_ACCEPT, multiple: true, reorderable: true, toolName:"Combine Images", title:"Drop images here", hint:"Order in the list = order in the grid." });
    p.appendChild(dz.element);
    const colsIn = H.numInput(H.setting("img-combine","cols",2), 1, 8, 1); colsIn.onchange = ()=> H.setSetting("img-combine","cols", +colsIn.value || 2);
    p.appendChild(H.field("Columns", colsIn));
    const gap = H.slider(H.setting("img-combine","gap",12), 0, 80, 1); const gapV = el("span","fsize", gap.value+" px");
    gap.oninput = ()=>{ gapV.textContent = gap.value+" px"; H.setSetting("img-combine","gap", +gap.value); };
    const gf = H.field("Spacing between photos", gap); gf.appendChild(gapV); p.appendChild(gf);
    const bg = el("input"); bg.type = "color"; bg.value = H.setting("img-combine","bg","#0a1628"); bg.oninput = ()=> H.setSetting("img-combine","bg", bg.value);
    p.appendChild(H.field("Background colour", bg));
    let fit = H.setting("img-combine","fit","cover");
    p.appendChild(H.field("Cell fit", H.radioRow([{value:"cover",label:"Fill cell (crop edges)"},{value:"contain",label:"Fit whole photo"}], fit, v=>{ fit = v; H.setSetting("img-combine","fit", v); })));
    const { btn, st, outs, showOut } = actionRow(p, "Combine & Download");
    btn.onclick = async ()=>{
      const files = dz.getFiles(); if(files.length < 2){ st.err("Add at least two images."); return; }
      btn.disabled = true; outs.clear(); st.say("Stitching…");
      try{
        const bmps = [];
        for(const f of files) bmps.push(await loadImg(f));
        const cols = Math.max(1, Math.min(files.length, +colsIn.value || 2));
        const g = +gap.value;
        const cellW = Math.min(1000, Math.max(...bmps.map(b=> b.width)));
        const cellH = cellW; // square cells keep the geometry predictable
        const rows = Math.ceil(bmps.length / cols);
        const W = cols * cellW + g * (cols + 1), Hh = rows * cellH + g * (rows + 1);
        const c = mkCanvas(W, Hh); const ctx = c.getContext("2d");
        ctx.fillStyle = bg.value; ctx.fillRect(0, 0, W, Hh);
        bmps.forEach((b, i)=>{
          const cx = g + (i % cols) * (cellW + g), cy = g + Math.floor(i / cols) * (cellH + g);
          if(fit === "cover"){
            const s = Math.max(cellW / b.width, cellH / b.height);
            const dw = b.width * s, dh = b.height * s;
            ctx.save(); ctx.beginPath(); ctx.rect(cx, cy, cellW, cellH); ctx.clip();
            ctx.drawImage(b, cx + (cellW - dw) / 2, cy + (cellH - dh) / 2, dw, dh); ctx.restore();
          } else {
            const s = Math.min(cellW / b.width, cellH / b.height);
            const dw = b.width * s, dh = b.height * s;
            ctx.drawImage(b, cx + (cellW - dw) / 2, cy + (cellH - dh) / 2, dw, dh);
          }
        });
        const blob = await encode(c, "image/png");
        showOut(); outs.add("collage_"+cols+"x"+rows+".png", blob, W+"×"+Hh+" px · "+bmps.length+" photos");
        st.ok("Done — "+bmps.length+" photos in a "+cols+"×"+rows+" grid ("+W+"×"+Hh+" px).");
      }catch(e){ st.err(e.message || String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= SPLIT IMAGE ================= */
Onyx.register({ id:"img-split", name:"Split Image", icon:"splitimg", section:"image",
  blurb:"Cut one photo into a grid of tiles — 3×3 for Instagram profile grids, or any rows × columns you like.",
  keywords:"split image grid instagram tiles cut pieces puzzle",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept: IMG_ACCEPT, multiple:false, toolName:"Split Image", title:"Drop an image here" });
    p.appendChild(dz.element);
    const colsIn = H.numInput(H.setting("img-split","cols",3), 1, 10, 1); const rowsIn = H.numInput(H.setting("img-split","rows",3), 1, 10, 1);
    colsIn.onchange = ()=> H.setSetting("img-split","cols", +colsIn.value || 3);
    rowsIn.onchange = ()=> H.setSetting("img-split","rows", +rowsIn.value || 3);
    const cc = el("div","cols"); cc.style.gridTemplateColumns = "1fr 1fr";
    const a = el("div"), b = el("div"); a.appendChild(H.field("Columns", colsIn)); b.appendChild(H.field("Rows", rowsIn)); cc.append(a, b); p.appendChild(cc);
    p.appendChild(el("p","small","Tiles download one by one, numbered left→right, top→bottom (tile-1 is top-left) — post them in reverse on Instagram so the grid reads correctly."));
    const { btn, st, outs, showOut } = actionRow(p, "Split & Prepare Tiles");
    btn.onclick = async ()=>{
      const f = dz.getFiles()[0]; if(!f){ st.err("Add an image first."); return; }
      btn.disabled = true; outs.clear(); st.say("Splitting…");
      try{
        const bmp = await loadImg(f);
        const cols = Math.max(1, +colsIn.value || 3), rows = Math.max(1, +rowsIn.value || 3);
        const tw = Math.floor(bmp.width / cols), th = Math.floor(bmp.height / rows);
        if(tw < 2 || th < 2) throw new Error("That grid is too fine for this image size.");
        showOut();
        let n = 0;
        for(let r = 0; r < rows; r++) for(let cI = 0; cI < cols; cI++){
          n++;
          const w = cI === cols - 1? bmp.width - tw * (cols - 1) : tw;
          const h = r === rows - 1? bmp.height - th * (rows - 1) : th;
          const tile = mkCanvas(w, h); tile.getContext("2d").drawImage(bmp, cI * tw, r * th, w, h, 0, 0, w, h);
          const blob = await encode(tile, "image/png");
          outs.add(H.baseName(f.name)+"_tile-"+n+".png", blob, w+"×"+h+" · row "+(r + 1)+", col "+(cI + 1));
        }
        st.ok("Done — "+n+" tiles of "+tw+"×"+th+" px ready below.");
      }catch(e){ st.err(e.message || String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= CIRCLE / ROUNDED CROP ================= */
Onyx.register({ id:"img-circle", name:"Circle & Rounded Crop", icon:"circlecrop", section:"image",
  blurb:"Round the corners of any photo — or make a perfect circle profile picture. Transparent PNG out.",
  keywords:"circle crop rounded corners profile picture avatar round png transparent",
  mount(root){
    const p = panel(root);
    let bmp = null, fileName = "image";
    const dz = H.dropzone({ accept: IMG_ACCEPT, multiple:false, toolName:"Circle & Rounded Crop", title:"Drop an image here",
      onChange: async files=>{ const f = files[0]; bmp = null; if(f){ fileName = f.name; bmp = await loadImg(f); paint(); } } });
    p.appendChild(dz.element);
    const square = H.checkRow("Centre square first (best for circle profile pictures)", true); square.box.onchange = paint; p.appendChild(square.row);
    const rad = H.slider(H.setting("img-circle","r",50), 0, 50, 1); const radV = el("span","fsize", rad.value+"%");
    rad.oninput = ()=>{ radV.textContent = rad.value+"%"; H.setSetting("img-circle","r", +rad.value); paint(); };
    const rf = H.field("Corner radius (50% = full round)", rad); rf.appendChild(radV); p.appendChild(rf);
    const stage = el("div","stage-wrap mt"); const pv = el("canvas"); stage.appendChild(pv); p.appendChild(stage);
    function render(src){
      let sx = 0, sy = 0, w = src.width, h = src.height;
      if(square.box.checked){ const m = Math.min(w, h); sx = (w - m) / 2; sy = (h - m) / 2; w = h = m; }
      const c = mkCanvas(w, h); const g = c.getContext("2d");
      const r = Math.min(w, h) * (+rad.value) / 100;
      g.beginPath();
      if(g.roundRect) g.roundRect(0, 0, w, h, r); else g.rect(0, 0, w, h);
      g.clip();
      g.drawImage(src, sx, sy, w, h, 0, 0, w, h);
      return c;
    }
    function paint(){ if(!bmp){ pv.width = 1; pv.height = 1; return; } /* checkerboard shows transparency honestly */
      const c = render(bmp); pv.width = c.width; pv.height = c.height; const g = pv.getContext("2d");
      const cell = 16; for(let y = 0; y < c.height; y += cell) for(let x = 0; x < c.width; x += cell){ g.fillStyle = ((x + y) / cell) % 2? "#c9d4e0" : "#eef3f8"; g.fillRect(x, y, cell, cell); }
      g.drawImage(c, 0, 0);
    }
    const { btn, st, outs, showOut } = actionRow(p, "Crop & Download PNG");
    btn.onclick = async ()=>{
      if(!bmp){ st.err("Add an image first."); return; }
      btn.disabled = true; st.say("Cropping…");
      try{
        const c = render(bmp);
        const blob = await encode(c, "image/png");
        showOut(); outs.add(H.baseName(fileName)+"_rounded.png", blob, c.width+"×"+c.height+" px · transparent corners");
        st.ok("Done — "+c.width+"×"+c.height+" px PNG with transparent corners.");
      }catch(e){ st.err(e.message || String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= SVG → PNG ================= */
Onyx.register({ id:"img-svg", name:"SVG to PNG", icon:"svg", section:"image",
  blurb:"Turn vector logos and icons into crisp PNGs at any size — transparent background preserved.",
  keywords:"svg to png vector rasterize logo icon convert scale",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept: ".svg,image/svg+xml", multiple:false, toolName:"SVG to PNG", title:"Drop an .svg file here" });
    p.appendChild(dz.element);
    const paste = el("textarea"); paste.rows = 4; paste.placeholder = "…or paste SVG markup here"; paste.style.width = "100%";
    paste.value = H.setting("img-svg","markup","");
    paste.onchange = ()=> H.setSetting("img-svg","markup", paste.value);
    p.appendChild(H.field("Or paste SVG markup", paste));
    const wIn = H.numInput(H.setting("img-svg","w",1024), 16, 8000, 1); wIn.onchange = ()=> H.setSetting("img-svg","w", +wIn.value || 1024);
    p.appendChild(H.field("Output width (px) — height follows the SVG's own proportions", wIn));
    p.appendChild(el("p","small","Note: browsers block external references inside SVGs (linked fonts/images) for security — fully self-contained SVGs render perfectly."));
    const { btn, st, outs, showOut } = actionRow(p, "Rasterize to PNG");
    btn.onclick = async ()=>{
      const f = dz.getFiles()[0];
      let markup = paste.value.trim();
      try{
        if(f) markup = await f.text();
        if(!markup) throw new Error("Drop an .svg file or paste its markup first.");
        btn.disabled = true; st.say("Rasterizing…");
        const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
        try{
          const img = await new Promise((res, rej)=>{ const im = new Image(); im.onload = ()=> res(im); im.onerror = ()=> rej(new Error("That SVG could not be parsed.")); im.src = url; });
          const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
          if(!iw || !ih) throw new Error("This SVG has no intrinsic size (no width/height or viewBox) — add one and try again.");
          const tw = Math.max(1, +wIn.value || 1024), th = Math.max(1, Math.round(tw * ih / iw));
          const c = mkCanvas(tw, th); c.getContext("2d").drawImage(img, 0, 0, tw, th);
          const blob = await encode(c, "image/png");
          showOut(); outs.add((f? H.baseName(f.name) : "svg")+"_"+tw+"x"+th+".png", blob, tw+"×"+th+" px");
          st.ok("Done — "+tw+"×"+th+" px PNG.");
        } finally { URL.revokeObjectURL(url); }
      }catch(e){ st.err(e.message || String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= FAVICON GENERATOR ================= */
Onyx.register({ id:"img-favicon", name:"Favicon Generator", icon:"favicon", section:"image",
  blurb:"One image in — a complete favicon set out: ICO + 16, 32, 48, 180, 192 and 512 px PNGs, zipped together.",
  keywords:"favicon generator ico icon website browser tab apple touch",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept: IMG_ACCEPT, multiple:false, toolName:"Favicon Generator", title:"Drop a square-ish logo or image here", hint:"A centred square works best — the image is centre-cropped to a square, never stretched." });
    p.appendChild(dz.element);
    const { btn, st, outs, showOut } = actionRow(p, "Generate Favicon Set");
    btn.onclick = async ()=>{
      const f = dz.getFiles()[0]; if(!f){ st.err("Add an image first."); return; }
      btn.disabled = true; outs.clear(); st.say("Generating…");
      try{
        const bmp = await loadImg(f);
        const m = Math.min(bmp.width, bmp.height);
        const squareC = mkCanvas(m, m); squareC.getContext("2d").drawImage(bmp, (bmp.width - m) / 2, (bmp.height - m) / 2, m, m, 0, 0, m, m);
        const sizes = [16, 32, 48, 180, 192, 512];
        const pngs = {};
        for(const s of sizes){
          const c = drawTo(squareC, s, s);
          const blob = await encode(c, "image/png");
          pngs[s] = new Uint8Array(await blob.arrayBuffer());
        }
        // ICO container with PNG entries (16/32/48)
        const icoSizes = [16, 32, 48];
        const head = new DataView(new ArrayBuffer(6 + icoSizes.length * 16));
        head.setUint16(0, 0, true); head.setUint16(2, 1, true); head.setUint16(4, icoSizes.length, true);
        let off = 6 + icoSizes.length * 16;
        const parts = [new Uint8Array(head.buffer)];
        icoSizes.forEach((s, i)=>{
          const p0 = 6 + i * 16; const data = pngs[s];
          head.setUint8(p0, s >= 256? 0 : s); head.setUint8(p0 + 1, s >= 256? 0 : s);
          head.setUint16(p0 + 4, 1, true); head.setUint16(p0 + 6, 32, true);
          head.setUint32(p0 + 8, data.length, true); head.setUint32(p0 + 12, off, true);
          off += data.length; parts.push(data);
        });
        const icoLen = parts.reduce((a, b)=> a + b.length, 0);
        const ico = new Uint8Array(icoLen); let q = 0; for(const pt of parts){ ico.set(pt, q); q += pt.length; }
        const zipFiles = [{ name: "favicon.ico", bytes: ico }];
        sizes.forEach(s=> zipFiles.push({ name: "favicon-"+s+".png", bytes: pngs[s] }));
        zipFiles.push({ name: "README.txt", bytes: new TextEncoder().encode("OnyxPDF Favicon set\nfavicon.ico — browser tab icon (16/32/48)\nfavicon-180.png — Apple touch icon\nfavicon-192.png / favicon-512.png — PWA / Android icons\nLink them:\n<link rel=\"icon\" href=\"/favicon.ico\" sizes=\"any\">\n<link rel=\"apple-touch-icon\" href=\"/favicon-180.png\">\n") });
        showOut();
        outs.add("favicons.zip", H.zipStore(zipFiles), sizes.length+" PNGs + ICO");
        outs.add("favicon.ico", ico, "16/32/48 multi-size");
        st.ok("Done — complete favicon set (ICO + "+sizes.length+" PNGs) in one ZIP.");
      }catch(e){ st.err(e.message || String(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= COLOUR PALETTE ================= */
Onyx.register({ id:"img-palette", name:"Color Palette from Image", icon:"palette", section:"image",
  blurb:"Pull the dominant colours out of any photo — hex codes with one-click copy for your designs.",
  keywords:"color palette extract dominant colors hex swatch scheme photo",
  mount(root){
    const p = panel(root);
    let bmp = null;
    const swBox = el("div","swatches hidden"); 
    const dz = H.dropzone({ accept: IMG_ACCEPT, multiple:false, toolName:"Color Palette", title:"Drop an image here",
      onChange: async files=>{ const f = files[0]; bmp = null; swBox.classList.add("hidden"); if(f){ bmp = await loadImg(f); extract(); } } });
    p.appendChild(dz.element);
    const nIn = H.numInput(H.setting("img-palette","n",6), 3, 10, 1); nIn.onchange = ()=>{ H.setSetting("img-palette","n", +nIn.value || 6); if(bmp) extract(); };
    p.appendChild(H.field("Colours to extract", nIn));
    p.appendChild(swBox);
    const { st } = (()=>{ const holder = el("div"); p.appendChild(holder); return { st: H.statusBox(holder) }; })();
    function extract(){
      if(!bmp) return;
      const W = 100, Hh = Math.max(1, Math.round(100 * bmp.height / bmp.width));
      const c = drawTo(bmp, W, Hh); const data = c.getContext("2d").getImageData(0, 0, W, Hh).data;
      const px = [];
      for(let i = 0; i < data.length; i += 4){ if(data[i + 3] < 200) continue; px.push([data[i], data[i + 1], data[i + 2]]); }
      if(px.length < 10){ st.err("Not enough solid pixels in this image to build a palette."); return; }
      // median-cut to N boxes, average each box
      let boxes = [px];
      const want = Math.max(3, Math.min(10, +nIn.value || 6));
      while(boxes.length < want){
        boxes.sort((a, b)=> b.length - a.length);
        const box = boxes.shift(); if(!box || box.length < 2){ if(box) boxes.push(box); break; }
        const ranges = [0, 1, 2].map(ch=> { let mn = 255, mx = 0; for(const pI of box){ if(pI[ch] < mn) mn = pI[ch]; if(pI[ch] > mx) mx = pI[ch]; } return mx - mn; });
        const ch = ranges.indexOf(Math.max(...ranges));
        box.sort((a, b)=> a[ch] - b[ch]);
        const mid = box.length >> 1;
        boxes.push(box.slice(0, mid), box.slice(mid));
      }
      const cols = boxes.map(box=>{
        const avg = [0, 1, 2].map(ch=> Math.round(box.reduce((s, pI)=> s + pI[ch], 0) / box.length));
        return { rgb: avg, n: box.length };
      }).sort((a, b)=> b.n - a.n).filter(x=> x.n > 0);
      swBox.innerHTML = "";
      cols.forEach(col=>{
        const hex = "#"+col.rgb.map(v=> v.toString(16).padStart(2, "0")).join("").toUpperCase();
        const sw = el("button","swatch");
        sw.innerHTML = `<span class="sw-color" style="background:${hex}"></span><span class="sw-hex">${hex}</span><span class="sw-pct">${Math.round(col.n / px.length * 100)}%</span>`;
        sw.title = "Copy "+hex;
        sw.onclick = async ()=>{ try{ await navigator.clipboard.writeText(hex); H.toast(hex+" copied"); }catch(e){ H.toast(hex); } };
        swBox.appendChild(sw);
      });
      swBox.classList.remove("hidden");
      st.ok("Found "+cols.length+" dominant colours — click any swatch to copy its hex.");
    }
  }
});

/* ================= BLUR & PIXELATE ================= */
Onyx.register({ id:"img-blur", name:"Blur & Pixelate", icon:"blur", section:"image",
  blurb:"Hide a face, plate or screenshot secret: drag a box over it, then blur or pixelate just that region.",
  keywords:"blur pixelate censor hide face license plate privacy mosaic region",
  mount(root){
    const p = panel(root);
    let bmp = null, fileName = "image";
    const ds = I.dragStage(null);
    const dz = H.dropzone({ accept: IMG_ACCEPT, multiple:false, toolName:"Blur & Pixelate", title:"Drop an image here",
      onChange: async files=>{ const f = files[0]; bmp = null; if(f){ fileName = f.name; bmp = await loadImg(f); ds.setImage(I.fitStage(bmp, 880, 760)); info.textContent = "Drag a box over the part to hide."; } } });
    p.appendChild(dz.element);
    let mode = H.setting("img-blur","mode","pixelate");
    p.appendChild(H.field("Effect", H.radioRow([{value:"pixelate",label:"Pixelate (mosaic)"},{value:"blur",label:"Blur"}], mode, v=>{ mode = v; H.setSetting("img-blur","mode", v); })));
    const str = H.slider(H.setting("img-blur","str",14), 4, 40, 1); const strV = el("span","fsize", str.value);
    str.oninput = ()=>{ strV.textContent = str.value; H.setSetting("img-blur","str", +str.value); };
    const sf = H.field("Strength", str); sf.appendChild(strV); p.appendChild(sf);
    p.appendChild(ds.stage);
    const info = el("div","small mt","Drop an image, then drag a box over the part to hide."); p.appendChild(info);
    ds.bind(()=> 0);
    ds.onFinal = s=>{ if(s && bmp){ const sx = bmp.width / ds.cv.width; info.textContent = "Region selected: "+Math.round(s.w * sx)+"×"+Math.round(s.h * (bmp.height / ds.cv.height))+" px. Click “Apply & Download”."; } };
    const { btn, st, outs, showOut } = actionRow(p, "Apply & Download");
    btn.onclick = async ()=>{
      if(!bmp){ st.err("Add an image first."); return; }
      const s = ds.getSel(); if(!s){ st.err("Drag a box over the part to hide first."); return; }
      btn.disabled = true; st.say("Applying…");
      try{
        const sx = bmp.width / ds.cv.width, sy = bmp.height / ds.cv.height;
        const x = Math.round(s.x * sx), y = Math.round(s.y * sy), w = Math.round(s.w * sx), h = Math.round(s.h * sy);
        const out = drawTo(bmp, bmp.width, bmp.height); const g = out.getContext("2d");
        const region = mkCanvas(w, h); region.getContext("2d").drawImage(bmp, x, y, w, h, 0, 0, w, h);
        if(mode === "blur"){
          const g2 = region.getContext("2d"); const tmp = mkCanvas(w, h);
          tmp.getContext("2d").filter = "blur("+(+str.value)+"px)"; tmp.getContext("2d").drawImage(region, 0, 0);
          g2.clearRect(0, 0, w, h); g2.drawImage(tmp, 0, 0);
          g.drawImage(region, x, y);
        } else {
          const blocks = Math.max(4, Math.round(w / (+str.value)));
          const small = mkCanvas(blocks, Math.max(4, Math.round(blocks * h / w)));
          const sg = small.getContext("2d"); sg.drawImage(region, 0, 0, small.width, small.height);
          g.imageSmoothingEnabled = false;
          g.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
          g.imageSmoothingEnabled = true;
        }
        const blob = await encode(out, "image/png");
        showOut(); outs.add(H.baseName(fileName)+"_censored.png", blob, w+"×"+h+" px region "+mode+"d");
        st.ok("Done — the selected region is unreadable; the rest of the photo is untouched.");
      }catch(e){ st.err(e.message || String(e)); }
      btn.disabled = false;
    };
  }
});
})();
