import type { Plugin } from 'vite';
export type Modules = Record<string, string | VirtualModule>;
export type VirtualModule = {
    file: string;
    exports?: string[];
};
/**
 * How application code addresses a key. Both styles share one wrapper, one
 * runtime and one HMR path — they differ only in how a key is reached and typed.
 *
 * - `manifest` — keys are values. The plugin emits a manifest module the client
 *   reads, so `run('key', cb)` takes the key at runtime. Types land on the
 *   `VirtualModule` interface in `@pingid/vite/types`.
 * - `module` — keys are import specifiers. `import { register } from 'virtual:key'`
 *   resolves statically, with no manifest and no client. Types land on an ambient
 *   declaration per key.
 */
export type Style = 'manifest' | 'module';
export interface VirtualOptions {
    /** How keys are addressed from application code. Default `manifest`. */
    style?: Style;
    /** Package name of this library, excluded from dep optimisation. Default `@pingid/vite`. */
    pkg?: string;
    /** Where to write the ambient declaration, relative to vite root. `false` to skip. Default `src/virtual.d.ts`. */
    types?: string | false;
}
export declare const virtual: (modules: Modules, options?: VirtualOptions) => Plugin;
//# sourceMappingURL=plugin.d.ts.map