import { INPUT, jobSpec, withPassword } from "./job.js";
export function infoJob(input, options = {}) {
    // jsonObject=trailer keeps the "qpdf" key small: it carries pdfversion without dumping every object.
    const job = { inputFile: INPUT, json: "2", jsonKey: ["qpdf", "pages", "encrypt"], jsonObject: ["trailer"] };
    return jobSpec(withPassword(job, options.password), { [INPUT]: input });
}
export function parseInfo(stdout) {
    const json = JSON.parse(stdout);
    return { pdfVersion: json.qpdf[0].pdfversion, pageCount: json.pages.length, encrypted: json.encrypt.encrypted };
}
