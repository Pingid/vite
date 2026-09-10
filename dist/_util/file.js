import fs from 'node:fs/promises';
import path from 'node:path';
export class File {
    _path;
    static project(meta, pth) {
        return new File(path.resolve(path.dirname(meta.filename), pth.replace(path.extname(pth), path.extname(meta.filename))));
    }
    static for(...paths) {
        return new File(path.resolve(...paths));
    }
    constructor(_path) {
        this._path = _path;
    }
    get dir() {
        return path.dirname(this.path);
    }
    get path() {
        return this._path;
    }
    async write(content) {
        if ((await fs.readFile(this.path, 'utf8').catch(() => null)) === content)
            return;
        await fs.mkdir(path.dirname(this.path), { recursive: true });
        await fs.writeFile(this.path, content);
    }
    toString() {
        return this.path;
    }
    [Symbol.for('nodejs.util.inspect.custom')]() {
        return this.toString();
    }
    [Symbol.toPrimitive]() {
        return this.toString();
    }
}
//# sourceMappingURL=file.js.map