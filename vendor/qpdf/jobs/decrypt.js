import { INPUT, jobSpec, OUTPUT, withPassword, withProgress } from "./job.js";
export function decryptJob(input, options) {
    const job = withPassword({ inputFile: INPUT, decrypt: "", outputFile: OUTPUT }, options.password);
    return jobSpec(withProgress(job, options), { [INPUT]: input });
}
