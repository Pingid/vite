import type { Plugin } from 'vite'
import { alias, iife, type IifeOptions } from '../plugin.ts'

export type SwOptions = Omit<IifeOptions, 'entrypoint'> & {
  /** ./src/sw.ts */
  worker: string
  /** module to recieve hot updates from */
  runner?: string
}

export const sw = (p: SwOptions) => {
  const al = alias({ [p.worker.replace('.ts', '.js')]: p.worker })
  const i = p.runner ? iife({ entrypoint: p.runner, esbuild: p.esbuild }) : undefined
  return {
    name: 'pingid:sw',
    ...i,
    async configureServer(server) {
      await al.configureServer.call(this, server)
      if (i) await i.configureServer.call(this, server)
    },
  } satisfies Plugin
}
