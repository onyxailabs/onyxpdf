import { inputName, jobSpec, OUTPUT, withProgress } from "./job.js";
export function mergeJob(inputs, options = {}) {
    if (inputs.length === 0)
        throw new RangeError("merge() needs at least one input");
    const files = {};
    const pages = inputs.map((bytes, index) => {
        const file = inputName(index);
        files[file] = bytes;
        const password = options.password?.[index];
        return password === undefined ? { file } : { file, password };
    });
    return jobSpec(withProgress({ empty: "", pages, outputFile: OUTPUT }, options), files);
}
