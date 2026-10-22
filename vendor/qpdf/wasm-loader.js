import { QpdfError } from "./errors.js";
/** Default location: next to this module (dist/wasm/qpdf.wasm). Bundlers rewrite this pattern. */
export function defaultWasmUrl() {
    return new URL("./wasm/qpdf.wasm", import.meta.url);
}
export function resolveWasmUrl(url) {
    if (url === undefined)
        return defaultWasmUrl();
    if (url instanceof URL)
        return url;
    const base = globalThis.location?.href ?? import.meta.url;
    return new URL(url, base);
}
export async function loadWasmModule(url) {
    const href = resolveWasmUrl(url);
    try {
        if (href.protocol === "file:")
            return await compileFromFile(href);
        const response = await fetch(href);
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        if (response.headers.get("content-type")?.startsWith("application/wasm")) {
            return await WebAssembly.compileStreaming(response);
        }
        return await WebAssembly.compile(await response.arrayBuffer());
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new QpdfError("FAILED", `failed to load qpdf.wasm from ${href.href}: ${reason}`);
    }
}
// process.getBuiltinModule (Node >= 24 here; available since 20.16) avoids any import statement bundlers could see.
async function compileFromFile(url) {
    const proc = globalThis.process;
    const fs = proc?.getBuiltinModule?.("node:fs/promises");
    if (!fs)
        throw new Error("file: URLs are only supported in Node.js >= 24");
    return WebAssembly.compile(await fs.readFile(url));
}
