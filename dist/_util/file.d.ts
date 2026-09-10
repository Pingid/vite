export declare class File {
    private readonly _path;
    static project(meta: ImportMeta, pth: string): File;
    static for(...paths: string[]): File;
    private constructor();
    get dir(): string;
    get path(): string;
    write(content: string): Promise<void>;
    toString(): string;
    [Symbol.toPrimitive](): string;
}
//# sourceMappingURL=file.d.ts.map