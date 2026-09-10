export type Dispose = () => void
export type Callback<T> = (mod: T) => Dispose | void
export type Register<T> = (cb: Callback<T>) => Dispose

/** Structural subset of vite's `ViteHotContext`, so this file has no vite import. */
export interface Hot {
  data: Record<string, any>
  accept: (cb: (mod: any) => void) => void
}

interface Entry<T> {
  cb: Callback<T>
  stop?: Dispose | void
}

/**
 * `hot` is `undefined` in a build, so the accept branch drops out and this
 * degrades to "call once, return a disposer".
 *
 * The entry set lives on `hot.data` rather than in this closure: after an
 * update the replaced generation's `register` disposers must still detach the
 * callbacks that the surviving generation is driving.
 */
export const create = <T>(mod: T, hot?: Hot): { register: Register<T>; accept: (next: any) => void } => {
  const entries: Set<Entry<T>> = hot ? (hot.data['entries'] ??= new Set()) : new Set()
  let current = mod

  const start = (e: Entry<T>) => (e.stop = e.cb(current))
  const stop = (e: Entry<T>) => {
    const s = e.stop
    e.stop = undefined
    s?.()
  }

  return {
    accept: (next) => {
      if (!next) return // vite will full-reload
      current = next?.['mod']
      for (const e of entries) (stop(e), start(e))
    },
    register: (cb) => {
      const e: Entry<T> = { cb }
      entries.add(e)
      start(e)
      return () => {
        if (entries.delete(e)) stop(e)
      }
    },
  }
}
