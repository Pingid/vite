import type { ResolvedConfig } from 'vite';
import * as esbuild from 'esbuild';
/** Global the hot bundle assigns its namespace to, and which `new Function` returns. */
export declare const IDENT = "__pingid_iife";
/** A finished bundle, plus every absolute path esbuild read to produce it. */
export type Output = {
    code: string;
    deps: string[];
};
/**
 * Vite's resolution and env, as far as esbuild can express them.
 *
 * `conditions` is the one that bites: this package asks consumers to set
 * `resolve.conditions: ['ts']`, and without forwarding it the bundle would
 * resolve `@pingid/vite` to `dist` while the page resolves it to `src`.
 *
 * `import.meta.env` is defined whole rather than key by key because under
 * `format: 'iife'` esbuild rewrites a bare `import.meta` to `{}` — defining
 * only `DEV`/`PROD`/`MODE` leaves every `VITE_*` var silently `undefined`.
 */
export declare const opts: (config: ResolvedConfig) => esbuild.BuildOptions;
export declare const bundler: (config: ResolvedConfig, shared?: esbuild.BuildOptions) => {
    /**
     * The outer script the browser registers: the harness with `file` inlined.
     * Built once per dev-server run so its bytes stay stable — the browser
     * byte-compares a service worker script on every `register()` and update
     * check, and changing bytes queues a fresh install behind every edit.
     */
    shell: (file: string, hot: string | null) => Promise<Output>;
    /** `file` alone, for `new Function(code)()` inside the already-running script. */
    unit: (file: string) => Promise<Output>;
};
export type Bundler = ReturnType<typeof bundler>;
/**
 * Path to one of this plugin's own runtime files.
 *
 * `import.meta` is this module's real location only while it stays a real
 * module. Vite bundles a config file's *relative* imports into a temp file, so
 * a plugin imported by source path from a vite config lands there and this
 * resolves to nothing — worth saying out loud rather than surfacing as an
 * esbuild resolve error.
 */
export declare const sibling: (rel: string) => string;
//# sourceMappingURL=build.d.ts.map