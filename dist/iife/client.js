import { PING } from './runtime.js';
/**
 * Nudges the worker registered from `url`'s script to pull the current build.
 *
 * `message` is a functional event, so it revives a dormant worker — which is
 * why the page relaying vite's own HMR beats the worker holding a stream open:
 * the browser terminates an idle worker within seconds, taking any stream with
 * it. Never reached in a build.
 */
export const ping = (hot) => {
    const container = globalThis.navigator?.serviceWorker;
    if (!container)
        return;
    void container.ready.then((reg) => {
        const worker = reg.active ?? reg.waiting ?? reg.installing;
        worker?.postMessage({ [PING]: hot });
    });
};
//# sourceMappingURL=client.js.map