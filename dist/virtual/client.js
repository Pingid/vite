/// <reference path="./ambient.d.ts" />
import { mods } from 'virtual:@pingid/vite/manifest';
export const run = (key, cb) => {
    const entry = mods[key];
    if (!entry)
        throw new Error(`[@pingid/vite] no virtual module registered for "${key}"`);
    return new VirtualMod(key, entry.load, cb);
};
export class VirtualMod {
    key;
    cb;
    def = defer();
    stop = () => { };
    disposed = false;
    resolved = null;
    constructor(key, load, cb) {
        this.key = key;
        this.cb = cb;
        const resolve = (mod) => {
            this.resolved = mod;
            this.def.resolve(this.resolved);
            return this.cb(mod);
        };
        load().then((m) => {
            if (this.disposed)
                return;
            this.stop = m.register((mod) => resolve(mod));
        }, (e) => this.def.reject(e instanceof Error ? e : new Error(String(e))));
    }
    then(onfulfilled = (x) => x, onrejected = console.error) {
        return this.def.promise.then(onfulfilled, onrejected);
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.stop();
        this.stop = () => { };
        if (this.resolved)
            return;
        this.def.reject(new Error(`[@pingid/vite] "${this.key}" disposed before it loaded`));
        this.def.promise.catch(() => { }); // nobody may be awaiting wait()
    }
    [Symbol.dispose]() {
        this.dispose();
    }
    async [Symbol.asyncDispose]() {
        if (this.disposed)
            return;
        await this.def.promise.catch(() => { });
        this.dispose();
    }
}
export const defer = () => {
    let res;
    let rej;
    const promise = new Promise((resolve, reject) => ((res = resolve), (rej = reject)));
    return { promise, resolve: (v) => res(v), reject: (e) => rej(e) };
};
//# sourceMappingURL=client.js.map