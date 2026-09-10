export declare const emitter: <T extends Record<string, unknown>>() => {
    on<K extends keyof T>(type: K, listener: (event: T[K]) => void): () => void;
    emit<K extends keyof T>(type: K, event: T[K]): void;
    clear(): void;
};
export declare class Jitt {
    static create(): Jitt;
    static str(s: string): string;
    private constructor();
    private lns;
    private indent;
    ln(...ln: (string | string[])[]): void;
    append(s: string): void;
    block(cb: () => void): void;
    fields(cb: (field: (name: string, value: string | (() => void)) => void) => void): void;
    child(): Jitt;
    insert(at: number, jitt: Jitt): void;
    toString(): string;
}
//# sourceMappingURL=shared.d.ts.map