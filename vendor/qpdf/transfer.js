/** Unique ArrayBuffers behind the given views. A duplicate in a transfer list throws DataCloneError. */
export function transferablesOf(files) {
    const buffers = new Set();
    for (const bytes of Object.values(files)) {
        if (bytes.buffer instanceof ArrayBuffer)
            buffers.add(bytes.buffer);
    }
    return [...buffers];
}
