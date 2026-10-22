export const INPUT = "in.pdf";
export const OUTPUT = "out.pdf";
export const JOB_FILE = "job.json";
export function inputName(index) {
    return `in-${index}.pdf`;
}
/** A JobSpec that runs qpdf with `job` (qpdf job JSON) and the given input files. */
export function jobSpec(job, files) {
    return {
        args: [`--job-json-file=${JOB_FILE}`],
        files: { ...files, [JOB_FILE]: new TextEncoder().encode(JSON.stringify(job)) },
    };
}
export function withPassword(job, password) {
    return password === undefined ? job : { ...job, password };
}
/** Asks qpdf for write progress (job JSON `progress`) when the caller passed onProgress. */
export function withProgress(job, options) {
    return options.onProgress === undefined ? job : { ...job, progress: "" };
}
