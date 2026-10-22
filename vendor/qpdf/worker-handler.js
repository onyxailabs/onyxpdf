import { runJob } from "./engine.js";
import { crashError, QpdfError } from "./errors.js";
import { transferablesOf } from "./transfer.js";
import { loadWasmModule } from "./wasm-loader.js";
/** Worker-side logic, separate from src/worker.ts so it can be tested without a real Worker. */
export function createWorkerHandler(port) {
    let wasm;
    return async (message) => {
        if (message.type === "init") {
            try {
                wasm = await loadWasmModule(message.wasmUrl);
                port.postMessage({ type: "ready" });
            }
            catch (error) {
                port.postMessage({ type: "init-error", message: errorMessage(error) });
            }
            return;
        }
        const { id, spec, progress } = message;
        try {
            if (!wasm)
                throw new QpdfError("FAILED", "qpdf worker received a job before init");
            // One message per new percent, unbatched (spec §3, guarantee 7). Messages from one worker arrive in order,
            // so every progress message reaches the pool before this job's result or error.
            const onProgress = progress ? (percent) => port.postMessage({ type: "progress", id, percent }) : undefined;
            const result = await runJob(wasm, spec, onProgress);
            port.postMessage({ type: "result", id, result }, transferablesOf(result.files));
        }
        catch (error) {
            // Same wording as the inline executor; the pool turns this into QpdfError FAILED.
            port.postMessage({ type: "error", id, message: crashError(error).message });
        }
    };
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
