import fs from 'node:fs/promises'
import path from 'node:path'

export class File {
  static project(meta: ImportMeta, pth: string) {
    return new File(
      path.resolve(path.dirname(meta.filename), pth.replace(path.extname(pth), path.extname(meta.filename))),
    )
  }
  static for(...paths: string[]) {
    return new File(path.resolve(...paths))
  }
  private constructor(private readonly _path: string) {}

  get dir() {
    return path.dirname(this.path)
  }

  get path() {
    return this._path
  }

  async write(content: string) {
    if ((await fs.readFile(this.path, 'utf8').catch(() => null)) === content) return
    await fs.mkdir(path.dirname(this.path), { recursive: true })
    await fs.writeFile(this.path, content)
  }

  toString() {
    return this.path
  }
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return this.toString()
  }
  [Symbol.toPrimitive](): string {
    return this.toString()
  }
}
