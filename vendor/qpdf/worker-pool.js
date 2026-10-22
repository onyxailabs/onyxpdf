import { QpdfError, terminatedError } from "./errors.js";
import { assertNotDetached } from "./input.js";
import { callSafely } from "./progress.js";
import { transferablesOf } from "./transfer.js";
/** Runs jobs on `size` workers, one job per worker at a time, FIFO. Crashed workers are replaced. */
export async function createWorkerPool(options) {
    const slots = [];
    const queue = [];
    let nextId = 1;
    let terminated = false;
    function startSlot() {
        return new Promise((resolve, reject) => {
            const slot = { worker: options.spawn(), ready: false, current: null };
            slots.push(slot);
            const failStart = (reason) => {
                removeSlot(slot);
                reject(new QpdfError("FAILED", `qpdf worker failed to start: ${reason}`));
            };
            // An error event without a message before "ready" means the script itself did not load
            // (404, wrong MIME type, or blocked by CSP). Browsers do not say which, so name the likely causes.
            const failLoad = (event) => {
                const message = messageOf(event);
                if (message)
                    return failStart(message);
                removeSlot(slot);
                reject(new QpdfError("FAILED", `qpdf worker failed to start (could not load ${options.workerUrl ?? "the worker script"}); ` +
                    "check that the worker script is served and allowed by your Content-Security-Policy (worker-src)"));
            };
            slot.worker.onmessage = ({ data }) => {
                if (data.type === "ready") {
                    slot.ready = true;
                    resolve();
                    dispatch();
                }
                else if (data.type === "init-error") {
                    failStart(data.message);
                }
                else if (data.type === "progress") {
                    // Only the job on this slot right now: a settled or terminated job has `current` cleared or replaced.
                    const job = slot.current;
                    if (job?.id === data.id && job.onProgress)
                        callSafely(job.onProgress, data.percent);
                }
                else if (data.type === "result") {
                    settle(slot, (job) => job.resolve(data.result));
                }
                else {
                    settle(slot, (job) => job.reject(new QpdfError("FAILED", data.message)));
                }
            };
            slot.worker.onerror = (event) => {
                if (slot.ready)
                    crash(slot, event);
                else
                    failLoad(event);
            };
            slot.worker.onmessageerror = (event) => {
                if (slot.ready)
                    crash(slot, event);
                else
                    failStart(describe(event));
            };
            slot.worker.postMessage({ type: "init", wasmUrl: options.wasmUrl });
        });
    }
    function removeSlot(slot) {
        slot.worker.terminate();
        const index = slots.indexOf(slot);
        if (index >= 0)
            slots.splice(index, 1);
    }
    function settle(slot, finish) {
        const job = slot.current;
        slot.current = null;
        if (job)
            finish(job);
        dispatch();
    }
    function crash(slot, event) {
        const job = slot.current;
        slot.current = null;
        removeSlot(slot);
        job?.reject(new QpdfError("FAILED", `qpdf worker crashed: ${describe(event)}`));
        if (terminated)
            return;
        startSlot().catch((error) => {
            if (slots.length === 0)
                rejectQueued(error);
        });
    }
    function dispatch() {
        if (terminated)
            return;
        for (const slot of [...slots]) {
            // A job that cannot be sent is rejected and the slot immediately takes the next one.
            while (slot.ready && !slot.current) {
                const job = queue.shift();
                if (!job)
                    return;
                slot.current = job;
                try {
                    for (const bytes of Object.values(job.spec.files))
                        assertNotDetached(bytes.buffer);
                    slot.worker.postMessage({ type: "job", id: job.id, spec: job.spec, progress: job.onProgress !== undefined }, transferablesOf(job.spec.files));
                }
                catch (error) {
                    slot.current = null;
                    job.reject(error instanceof TypeError
                        ? error
                        : new QpdfError("FAILED", `failed to send job to qpdf worker: ${error instanceof Error ? error.message : String(error)}`));
                }
            }
        }
    }
    function rejectQueued(error) {
        for (const job of queue.splice(0))
            job.reject(error);
    }
    try {
        await Promise.all(Array.from({ length: options.size }, () => startSlot()));
    }
    catch (error) {
        for (const slot of [...slots])
            removeSlot(slot);
        throw error;
    }
    return {
        exec(spec, onProgress) {
            if (terminated)
                return Promise.reject(terminatedError());
            if (slots.length === 0)
                return Promise.reject(new QpdfError("FAILED", "no qpdf workers are available"));
            return new Promise((resolve, reject) => {
                queue.push({ id: nextId++, spec, onProgress, resolve, reject });
                dispatch();
            });
        },
        terminate() {
            if (terminated)
                return;
            terminated = true;
            const error = terminatedError();
            for (const slot of [...slots]) {
                slot.current?.reject(error);
                slot.current = null;
                removeSlot(slot);
            }
            rejectQueued(error);
        },
    };
}
function messageOf(event) {
    if (typeof event === "object" && event !== null && "message" in event && typeof event.message === "string" && event.message) {
        return event.message;
    }
    return undefined;
}
function describe(event) {
    return messageOf(event) ?? "unknown worker error";
}
