import { INPUT, jobSpec, withPassword, withProgress } from "./job.js";
const SPLIT_OUTPUT = /^out-(\d+)(?:-\d+)?\.pdf$/;
export function splitJob(input, options = {}) {
    const pagesPerFile = options.pagesPerFile ?? 1;
    if (!Number.isInteger(pagesPerFile) || pagesPerFile < 1) {
        throw new RangeError("split() pagesPerFile must be an integer >= 1");
    }
    const job = { inputFile: INPUT, splitPages: String(pagesPerFile), outputFile: "out-%d.pdf" };
    return jobSpec(withProgress(withPassword(job, options.password), options), { [INPUT]: input });
}
/** qpdf names split outputs out-N.pdf or out-N-M.pdf; return them in page order. */
export function collectSplitOutputs(files) {
    return Object.entries(files)
        .flatMap(([name, bytes]) => {
        const match = SPLIT_OUTPUT.exec(name);
        return match ? [{ first: Number(match[1]), bytes }] : [];
    })
        .sort((a, b) => a.first - b.first)
        .map((entry) => entry.bytes);
}
