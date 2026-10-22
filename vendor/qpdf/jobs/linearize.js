import { INPUT, jobSpec, OUTPUT, withPassword, withProgress } from "./job.js";
export function linearizeJob(input, options = {}) {
    const job = withPassword({ inputFile: INPUT, linearize: "", outputFile: OUTPUT }, options.password);
    return jobSpec(withProgress(job, options), { [INPUT]: input });
}
