import type { VirtualModule } from '@pingid/vite/types'
import './types.ts'

export type Run = {
  <K extends keyof VirtualModule>(key: K, cb: (module: VirtualModule[K]) => () => void): VirtualMod<VirtualModule[K]>
  <K extends keyof VirtualModule, T extends (keyof VirtualModule[K])[]>(
    key: K,
    exports: T,
    cb: (module: Pick<VirtualModule[K], T[number]>) => () => void,
  ): VirtualMod<Pick<VirtualModule[K], T[number]>>
}

export const run: Run = <K extends keyof VirtualModule>(
  key: K,
  cbore: (module: VirtualModule[K]) => () => void,
  cb?: any,
): VirtualMod<K> => {
  if (typeof cbore !== 'function') {
    return new VirtualMod<K>(import(/* @vite-ignore */ `./virtual:${key}?exports=${(cbore as any).join(',')}`), cb)
  }
  return new VirtualMod<K>(import(/* @vite-ignore */ `./virtual:${key}`), cbore)
}

type Resolved<T> = { mod: T; file: string }

class VirtualMod<T extends Record<string, any>> {
  private def = defer<Resolved<T>>()
  private disposed = false
  private stop = () => {}
  public resolved: Resolved<T> | null = null

  constructor(
    mod: Promise<any>,
    private cb: (module: T) => () => void,
  ) {
    mod.then(
      (m) => {
        if (this.disposed) return
        this.stop = (m as any).register((m: any) => this.handle(m))
        this.resolve(m)
      },
      (e) => this.def.reject(e),
    )
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.stop()
  }

  wait() {
    return this.def.promise
  }

  [Symbol.dispose]() {
    this.dispose()
  }

  async [Symbol.asyncDispose]() {
    if (this.disposed) return Promise.resolve()
    await this.wait()
    this.dispose()
    return
  }

  private handle(m: any) {
    if (this.disposed) return () => {}
    return this.cb(m)
  }

  private resolve(m: any) {
    if (this.disposed) return
    this.resolved = { mod: m.mod, file: (m as any).file }
    this.def.resolve(this.resolved)
  }
}

export const defer = <T>() => {
  let res: (value: T) => void
  let rej: (error: Error) => void
  const promise = new Promise<T>((resolve, reject) => {
    res = (v) => resolve(v)
    rej = (e) => reject(e)
  })
  return { promise, resolve: (v: T) => res(v), reject: (e: Error) => rej(e) }
}
