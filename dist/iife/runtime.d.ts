/** What an iife entry default-exports: set up, hand back teardown. */
export type Setup = () => (() => void) | void;
/** Marks a `postMessage` from the page as a hot-reload nudge for `url`. */
export declare const PING = "__pingid_iife_ping";
type Mod = {
    default?: Setup;
};
/** What a build's shell calls: setup runs once, there is nothing to swap. */
export declare const boot: (mod: Mod) => void;
/**
 * What a dev shell calls. Split from {@link boot} rather than branching on a
 * parameter so the transport below — `new Function` included — is simply absent
 * from a build, instead of shipped as unreachable code esbuild can't prove dead.
 *
 * `hot` serves the entry bundled on its own.
 */
export declare const bootHot: (mod: Mod, hot: string) => void;
export {};
//# sourceMappingURL=runtime.d.ts.map