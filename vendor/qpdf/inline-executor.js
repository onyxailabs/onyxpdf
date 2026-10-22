import { runJob } from "./engine.js";
import { crashError, terminatedError } from "./errors.js";
import { callSafely } from "./progress.js";
/** Runs jobs on the calling thread. Used in Node and with `inline: true`. */
export function createInlineExecutor(wasm) {
    let terminated = false;
    return {
        async exec(spec, onProgress) {
            if (terminated)
                throw terminatedError();
            let settled = false;
            // Never after this job settles or after terminate(); a throwing callback must not abort qpdf.
            const report = onProgress &&
                ((percent) => {
                    if (!settled && !terminated)
                        callSafely(onProgress, percent);
                });
            try {
                return await runJob(wasm, spec, report);
            }
            catch (error) {
                throw crashError(error);
            }
            finally {
                settled = true;
            }
        },
        terminate() {
            terminated = true;
        },
    };
}
