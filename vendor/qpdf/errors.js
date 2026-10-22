// The only module that matches qpdf's message text. Every pattern is covered by test/unit/errors.test.ts,
// so a wording change in a qpdf upgrade fails CI instead of silently degrading.
export class QpdfError extends Error {
    code;
    /** qpdf exit code, or null when qpdf did not run to completion. */
    exitCode;
    stderr;
    constructor(code, message, details = {}) {
        super(message);
        this.name = "QpdfError";
        this.code = code;
        this.exitCode = details.exitCode ?? null;
        this.stderr = details.stderr ?? "";
    }
}
const INVALID_PASSWORD = /: invalid password$/m;
const INVALID_PDF = /can't find PDF header|unable to find trailer dictionary/;
const WARNING_PREFIX = "WARNING: ";
export function classifyFailure(stderr) {
    if (INVALID_PASSWORD.test(stderr))
        return "INVALID_PASSWORD";
    if (INVALID_PDF.test(stderr))
        return "INVALID_PDF";
    return "FAILED";
}
export function parseWarnings(stderr) {
    return stderr
        .split("\n")
        .filter((line) => line.startsWith(WARNING_PREFIX))
        .map((line) => line.slice(WARNING_PREFIX.length));
}
const PROGRESS_LINE = /: write progress: (\d+)%$/;
/** The percent in a qpdf `--progress` line ("qpdf: out.pdf: write progress: 42%"), or null for any other line. */
export function parseProgressLine(line) {
    const match = PROGRESS_LINE.exec(line);
    return match ? Number(match[1]) : null;
}
export function failureFromResult(result) {
    const lines = result.stderr
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "" && !line.startsWith(WARNING_PREFIX));
    const last = lines.at(-1)?.replace(/^qpdf: /, "");
    return new QpdfError(classifyFailure(result.stderr), last ?? `qpdf failed with exit code ${result.exitCode}`, {
        exitCode: result.exitCode,
        stderr: result.stderr,
    });
}
export function terminatedError() {
    return new QpdfError("TERMINATED", "qpdf instance was terminated");
}
/**
 * Normalises anything a job threw: QpdfErrors pass through; anything else (a wasm trap, an
 * out-of-memory abort, a failed instantiation) becomes FAILED. Used by both executors.
 */
export function crashError(error) {
    if (error instanceof QpdfError)
        return error;
    return new QpdfError("FAILED", `qpdf crashed: ${error instanceof Error ? error.message : String(error)}`);
}
