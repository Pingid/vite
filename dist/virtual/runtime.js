/**
 * `hot` is `undefined` in a build, so the accept branch drops out and this
 * degrades to "call once, return a disposer".
 *
 * The entry set lives on `hot.data` rather than in this closure: after an
 * update the replaced generation's `register` disposers must still detach the
 * callbacks that the surviving generation is driving.
 */
export const create = (mod, hot) => {
    const entries = hot ? (hot.data['entries'] ??= new Set()) : new Set();
    let current = mod;
    const start = (e) => (e.stop = e.cb(current));
    const stop = (e) => {
        const s = e.stop;
        e.stop = undefined;
        s?.();
    };
    return {
        accept: (next) => {
            if (!next)
                return; // vite will full-reload
            current = next?.['mod'];
            for (const e of entries)
                (stop(e), start(e));
        },
        register: (cb) => {
            const e = { cb };
            entries.add(e);
            start(e);
            return () => {
                if (entries.delete(e))
                    stop(e);
            };
        },
    };
};
//# sourceMappingURL=runtime.js.map