import { HOT_ATTACHED } from './build/const.ts'

export const $hot = <M extends Promise<Record<string, any>>>(m: M, cb: (m: Awaited<M>) => () => void) => {
  let disposed = false

  let last = (): void => {}

  const run = (x: Awaited<M>) => {
    if (disposed) return
    last()
    last = cb(x)
  }

  m.then(async (c) => {
    run(c as any)
    if (typeof (c as any)[HOT_ATTACHED] === 'function') (c as any)[HOT_ATTACHED]((x: any) => run(x))
  })

  return () => {
    disposed = true
    last()
    last = (): void => {}
  }
}
