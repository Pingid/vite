export const emitter = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listeners = new Map();
    return {
        on(type, listener) {
            const set = listeners.get(type) ?? new Set();
            listeners.set(type, set);
            set.add(listener);
            let attached = true;
            return () => {
                if (!attached)
                    return;
                attached = false;
                set.delete(listener);
                // Only drop the bucket if it is still the one we added to.
                if (set.size === 0 && listeners.get(type) === set)
                    listeners.delete(type);
            };
        },
        emit(type, event) {
            // Copy so listeners can safely detach while emitting.
            for (const listener of [...(listeners.get(type) ?? [])]) {
                try {
                    listener(event);
                }
                catch (error) {
                    // Surface the failure without stopping the remaining listeners.
                    queueMicrotask(() => {
                        throw error;
                    });
                }
            }
        },
        clear() {
            listeners.clear();
        },
    };
};
export class Jitt {
    static create() {
        return new Jitt();
    }
    static str(s) {
        return JSON.stringify(s);
    }
    constructor() { }
    lns = [];
    indent = 0;
    ln(...ln) {
        this.lns.push(...ln.flat().map((l) => ' '.repeat(this.indent) + l));
    }
    append(s) {
        this.lns[this.lns.length - 1] += s;
    }
    block(cb) {
        this.lns[this.lns.length - 1] += ' {';
        this.indent += 2;
        cb();
        this.indent -= 2;
        this.ln('}');
    }
    fields(cb) {
        this.lns[this.lns.length - 1] += ' {';
        this.indent += 2;
        cb((name, value) => {
            if (typeof value !== 'function')
                return this.ln(`${Jitt.str(name)}: ${value},`);
            this.ln(`${Jitt.str(name)}:`);
            value();
            this.lns[this.lns.length - 1] += ',';
        });
        this.indent -= 2;
        this.ln('}');
    }
    child() {
        return new Jitt();
    }
    insert(at, jitt) {
        this.lns.splice(at, 0, ...jitt.lns);
    }
    toString() {
        return this.lns.join('\n');
    }
}
//# sourceMappingURL=shared.js.map