export type Namespace<K extends string, F extends Record<string, string> = {}> = {
    id: K;
    files: F;
    encoded: `\0${K}`;
    match<T>(id: string, fn: (match: NameMatch<Namespace<K, F>, keyof F | Unknown>) => T): T | null;
    name(id: `${K}:${string}` | `\0${K}:${string}`): string;
    includes(name: string): name is `${K}:${string}` | `\0${K}:${string}`;
    unknown<N extends string>(name: N): UnknownMatch<Namespace<K, F>>;
} & Known<K, F>;
export declare const namespace: <K extends string, F extends Record<string, string> = {}>(id: K, files?: F) => Namespace<K, F>;
type Known<K extends string, F extends Record<string, string>> = {
    [N in keyof F]: {
        id: `${K}:${N & string}`;
        encoded: `\0${K}:${N & string}`;
    };
};
type Unknown = string & {
    __brand: 'unknown';
};
type NameMatch<N extends Namespace<any, any>, F extends keyof N['files'] | Unknown = keyof N['files'] | Unknown> = F extends Unknown ? UnknownMatch<N> : KnownMatch<N, F>;
interface KnownMatch<N extends Namespace<any, any>, F extends keyof N['files']> {
    kind: F;
    name: F;
    id: `${N['id']}:${N['files'][F]}`;
    encoded: `\0${N['id']}:${N['files'][F]}`;
}
interface UnknownMatch<N extends Namespace<any, any>> {
    kind: 'unknown';
    name: string;
    id: `${N['id']}:${string}`;
    encoded: `\0${N['id']}:${string}`;
}
export {};
//# sourceMappingURL=vite.d.ts.map