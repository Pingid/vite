import type { Plugin } from 'vite';
import type * as esbuild from 'esbuild';
export type Entries = Record<string, string | Entry>;
export type Entry = {
    file: string;
    /** Served and emitted at `<base><fileName>`. Default `<key>.js`. */
    fileName?: string;
    esbuild?: esbuild.BuildOptions;
};
export interface IifeOptions {
    /** Package name of this library, excluded from dep optimisation. Default `@pingid/vite`. */
    pkg?: string;
    /** Where to write the ambient declaration, relative to vite root. `false` to skip. Default `src/iife.d.ts`. */
    types?: string | false;
    /** Merged into every entry's esbuild options. */
    esbuild?: esbuild.BuildOptions;
}
/**
 * Bundles an entry and everything it imports into one self-contained classic
 * script, serves it in dev and emits it as an asset in a build.
 *
 * The entry default-exports its setup and hands back teardown, which is what
 * makes it hot-swappable: on an edit the entry is rebuilt on its own and pushed
 * into the *running* script, where the previous teardown runs before the new
 * setup. Nothing re-registers and no install cycle happens.
 */
export declare const iife: (entries: Entries, options?: IifeOptions) => Plugin;
//# sourceMappingURL=plugin.d.ts.map