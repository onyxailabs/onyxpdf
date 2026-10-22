import { INPUT, jobSpec, OUTPUT, withPassword, withProgress } from "./job.js";
const ANGLES = { 90: "+90", 180: "+180", 270: "+270", [-90]: "-90" };
export function rotateJob(input, rotations, options = {}) {
    if (rotations.length === 0)
        throw new RangeError("rotate() needs at least one rotation");
    const rotate = rotations.map(({ angle, pages }) => {
        const prefix = ANGLES[angle];
        if (prefix === undefined)
            throw new RangeError(`rotate() angle must be 90, 180, 270 or -90, got ${angle}`);
        return `${prefix}:${pages ?? "1-z"}`;
    });
    const job = { inputFile: INPUT, rotate, outputFile: OUTPUT };
    return jobSpec(withProgress(withPassword(job, options.password), options), { [INPUT]: input });
}
