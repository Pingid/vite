import { type HotUpdate, SW_UPDATE } from './const.ts'

export const propogateHotUpdates = (p: { entrypoint?: string; send: (data: any) => void }) => {
  if (import.meta.hot) {
    import.meta.hot.on(SW_UPDATE.type, (data) => {
      if (p.entrypoint && data.entrypoint !== p.entrypoint) return
      p.send(data)
    })
  }
}

const getUpdate = (msg: unknown): HotUpdate | undefined => {
  const data = msg
  if (typeof data !== 'object' || data === null) return
  if ((data as any).type !== SW_UPDATE.type || typeof (data as any).code !== 'string') return
  return { type: SW_UPDATE.type, code: (data as any).code, entrypoint: (data as any).entrypoint }
}

export const runner = <Mod extends Record<string, any>>(cb: (x: Mod) => () => void) => {
  let last = (): void => {}
  const run = (x: Mod) => (last(), (last = cb(x)))
  return {
    run,
    msg: (msg: unknown) => {
      try {
        const update = getUpdate(msg) ?? getUpdate((msg as any)?.data)
        if (!update) return false
        const mod = new Function(update.code)()
        run(mod)
        return true
      } catch (error) {
        console.error(error)
      }
      return false
    },
    dispose: () => (last(), (last = (): void => {})),
  }
}
