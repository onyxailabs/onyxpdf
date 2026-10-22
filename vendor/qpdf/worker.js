import { createWorkerHandler } from "./worker-handler.js";
const scope = globalThis;
const handle = createWorkerHandler({ postMessage: (message, transfer = []) => scope.postMessage(message, transfer) });
scope.onmessage = (event) => {
    void handle(event.data);
};
