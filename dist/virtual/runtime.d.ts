export type Dispose = () => void;
export type Callback<T> = (mod: T) => Dispose | void;
export type Register<T> = (cb: Callback<T>) => Dispose;
/** Structural subset of vite's `ViteHotContext`, so this file has no vite import. */
export interface Hot {
    data: Record<string, any>;
    accept: (cb: (mod: any) => void) => void;
}
/**
 * `hot` is `undefined` in a build, so the accept branch drops out and this
 * degrades to "call once, return a disposer".
 *
 * The entry set lives on `hot.data` rather than in this closure: after an
 * update the replaced generation's `register` disposers must still detach the
 * callbacks that the surviving generation is driving.
 */
export declare const create: <T>(mod: T, hot?: Hot) => {
    register: Register<T>;
    accept: (next: any) => void;
};
//# sourceMappingURL=runtime.d.ts.map