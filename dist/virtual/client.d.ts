import type { VirtualModule } from '@pingid/vite/types';
import type { Callback, Register } from './runtime.ts';
/** `string` until the generated declaration augments `VirtualModule`. */
export type Key = keyof VirtualModule extends never ? string : keyof VirtualModule;
type Mod<K> = K extends keyof VirtualModule ? VirtualModule[K] : Record<string, any>;
export declare const run: <K extends Key>(key: K, cb: Callback<Mod<K>>) => VirtualMod<Mod<K>>;
export type Resolved<T> = T;
export declare class VirtualMod<T> {
    private key;
    private cb;
    private def;
    private stop;
    private disposed;
    resolved: Resolved<T> | null;
    constructor(key: string, load: () => Promise<{
        register: Register<T>;
    }>, cb: Callback<T>);
    then<R = Resolved<T>>(onfulfilled?: (value: Resolved<T>) => R, onrejected?: (reason: any) => void): Promise<void | R>;
    dispose(): void;
    [Symbol.dispose](): void;
    [Symbol.asyncDispose](): Promise<void>;
}
export declare const defer: <T>() => {
    promise: Promise<T>;
    resolve: (v: T) => void;
    reject: (e: Error) => void;
};
export {};
//# sourceMappingURL=client.d.ts.map