/* OnyxPDF — Protect & Unlock, powered by the real qpdf compiled to WebAssembly
   (@mssio/qpdf-wasm, qpdf 12.4.2 — vendored in vendor/qpdf, loaded lazily).
   Verified by an encrypt→decrypt round-trip test before shipping (see BUILD-REPORT). */
(function(){
"use strict";
const H = window.H, { el, esc } = H;

function panel(root){ const p = el("div","panel"); root.appendChild(p); return p; }
function actionRow(parent, label){
  const row = el("div","btn-row"); const btn = el("button","btn", esc(label)); row.appendChild(btn); parent.appendChild(row);
  const st = H.statusBox(parent);
  const outPanel = el("div","panel"); outPanel.classList.add("hidden");
  const outs = H.outputList(); outPanel.appendChild(outs.element); parent.parentNode.appendChild(outPanel);
  return { btn, st, outs, showOut(){ outPanel.classList.remove("hidden"); } };
}
let qpdfPromise = null;
const SCRIPT_URL = (document.currentScript && document.currentScript.src) || document.baseURI;
function getQpdf(){
  if(!qpdfPromise){
    const moduleUrl = new URL("../vendor/qpdf/index.js", SCRIPT_URL).href;
    const wasmUrl = new URL("../vendor/qpdf/wasm/qpdf.wasm", SCRIPT_URL).href;
    qpdfPromise = import(moduleUrl)
      .then(m => m.createQpdf({ wasmUrl }))
      .catch(e => { qpdfPromise = null; throw new Error("The encryption engine failed to load: " + (e.message||e)); });
  }
  return qpdfPromise;
}
function friendlyQpdf(e){
  const code = e && (e.code || "");
  const msg = (e && e.message) || String(e);
  if(code === "INVALID_PASSWORD" || /invalid password/i.test(msg)) return "That password doesn't match this file. Check it and try again.";
  if(/encrypt/i.test(msg) && /already/i.test(msg)) return "This file is already encrypted.";
  return msg;
}
function pwInput(placeholder){ const i = el("input"); i.type = "password"; i.autocomplete = "off"; i.placeholder = placeholder||""; i.style.cssText = "width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--input);font-size:14.5px"; return i; }

/* ================= PROTECT ================= */
Onyx.register({ id:"protect", name:"Protect PDF (Password)", icon:"protect", tag:"Real AES-256",
  blurb:"Lock a PDF with a real password — AES-256 encryption powered by qpdf, plus print/copy/edit permission controls. Done locally, of course.",
  keywords:"protect password encrypt lock secure permissions aes",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept:".pdf", multiple:false, toolName:"Protect PDF", title:"Drop a PDF here" });
    p.appendChild(dz.element);
    const userPw = pwInput("Password needed to open the file");
    const ownerPw = pwInput("Optional — a different owner password for permission control");
    p.appendChild(H.field("Open password (user password)", userPw));
    p.appendChild(H.field("Owner password", ownerPw));
    let bits = 256;
    p.appendChild(H.field("Encryption strength", H.radioRow([{value:256,label:"AES-256 (recommended)"},{value:128,label:"AES-128 (older readers)"}], bits, v=> bits = +v)));
    const allowPrint = H.checkRow("Allow printing", true);
    const allowCopy = H.checkRow("Allow copying text & images", true);
    const allowModify = H.checkRow("Allow modifying the document", true);
    const allowAnnot = H.checkRow("Allow annotations / form filling", true);
    p.append(allowPrint.row, allowCopy.row, allowModify.row, allowAnnot.row);
    p.appendChild(el("p","small","There is no password recovery — if you forget it, the file stays locked. That's the point of real encryption. Permissions are honoured by standard PDF readers."));
    const { btn, st, outs, showOut } = actionRow(p, "Encrypt & Save");
    btn.onclick = async ()=>{
      const file = dz.getFiles()[0]; if(!file){ st.err("Choose a PDF first."); return; }
      if(!userPw.value){ st.err("Set an open password first."); return; }
      btn.disabled = true; st.say("Loading encryption engine…");
      try{
        const qpdf = await getQpdf();
        st.say("Encrypting locally…");
        const { output, warnings } = await qpdf.encrypt(await H.fileBytes(file), {
          userPassword: userPw.value,
          ownerPassword: ownerPw.value || userPw.value,
          bits,
          allow: { print: allowPrint.box.checked, extract: allowCopy.box.checked, modify: allowModify.box.checked, annotate: allowAnnot.box.checked }
        });
        showOut(); outs.add(H.baseName(file.name)+"_protected.pdf", output, "AES-"+bits+" encrypted");
        st.ok("Done — the PDF is now password-protected." + (warnings && warnings.length? " ("+warnings[0]+")" : ""));
      }catch(e){ st.err(friendlyQpdf(e)); }
      btn.disabled = false;
    };
  }
});

/* ================= UNLOCK ================= */
Onyx.register({ id:"unlock", name:"Unlock PDF (Remove Password)", icon:"unlock", tag:"Real decryption",
  blurb:"Remove password protection from a PDF you own — you supply the password, qpdf removes the encryption locally.",
  keywords:"unlock remove password decrypt unprotect open locked pdf",
  mount(root){
    const p = panel(root);
    const dz = H.dropzone({ accept:".pdf", multiple:false, toolName:"Unlock PDF", title:"Drop the locked PDF here" });
    p.appendChild(dz.element);
    const pw = pwInput("The file's password");
    p.appendChild(H.field("Password", pw));
    p.appendChild(el("p","small","Only works with the correct password (user or owner). This tool can't crack or guess passwords — it's for your own files."));
    const { btn, st, outs, showOut } = actionRow(p, "Unlock & Save");
    btn.onclick = async ()=>{
      const file = dz.getFiles()[0]; if(!file){ st.err("Choose a PDF first."); return; }
      if(!pw.value){ st.err("Enter the file's password."); return; }
      btn.disabled = true; st.say("Loading decryption engine…");
      try{
        const qpdf = await getQpdf();
        st.say("Decrypting locally…");
        const { output } = await qpdf.decrypt(await H.fileBytes(file), { password: pw.value });
        showOut(); outs.add(H.baseName(file.name)+"_unlocked.pdf", output, "encryption removed");
        st.ok("Done — the unlocked copy has no password. It will now work in every other OnyxPDF tool.");
      }catch(e){ st.err(friendlyQpdf(e)); }
      btn.disabled = false;
    };
  }
});
})();
