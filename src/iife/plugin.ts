import type { ModuleNode, Plugin, ViteDevServer } from 'vite'
import { mergeConfig } from 'vite'

import type * as esbuild from 'esbuild'

import { bundler, CONST, Strategy } from './build/index.ts'
import { isDepOf, virtual } from '../_util/vite.ts'

export type IifeOptions = {
  entry: string
  hot?: { kind: 'sse' } | { kind: 'hot'; name?: string }
  esbuild?: esbuild.BuildOptions
}

const SSE_URL = '/__hot_sse__'

export const iife = (p: IifeOptions) => {
  const dependencies = virtual('dependencies')
  // const notify = virtual('notify')

  const listeners: Set<(data: any) => void> = new Set()
  const emit = (data: any) => {
    for (const listener of listeners) listener(data)
  }
  const register: Strategy.Register = (cb) => {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }

  const strategy = (() => {
    if (p.hot?.kind === 'hot') return Strategy.hot(p.hot.name)
    return Strategy.sse(SSE_URL)
  })()(p.entry, register)

  const b = bundler({ url: SSE_URL, opts: p.esbuild, strategy })

  const hot = async (server: ViteDevServer, mod: ModuleNode) => {
    if (!mod.file) return
    const code = await b.hot(mod.file, server.config)
    console.log('hot', mod.file, listeners)
    emit(CONST.SSE_HOT_EVENT.make(mod.file, code))
  }

  let tracking: string[] = []
  const tracks = serial(async (server: ViteDevServer) => {
    tracking = strategy.imported()
    await server.transformRequest(dependencies.url)
  })

  const entry = memoTtl(4_000, (server: ViteDevServer, pth: string) =>
    b.entry(pth, server.config).then((code) => (tracks(server), code)),
  )

  const toFile = () => {
    let code = 'void 2;'
    let i = 0
    for (const imp of tracking) {
      code += `import * as imp${i} from '${imp}';\n`
      code += `void imp${i};\n`
      i++
    }
    return code
  }

  return {
    name: 'pingid:iife',

    config: (c) => mergeConfig(c ?? {}, { build: { rolldownOptions: { [dependencies.id]: dependencies.id } } }),
    resolveId: dependencies.resolver(),
    load: dependencies.loader(() => toFile()),

    async handleHotUpdate(ctx) {
      const virtualMod = await ctx.server.moduleGraph.getModuleByUrl(dependencies.url)
      if (!virtualMod) return console.warn('no virtual module for', dependencies.url)
      const mods = Array.from(ctx.server.moduleGraph.getModulesByFile(ctx.file) ?? [])
      for (const p of virtualMod.importedModules) {
        for (const m of mods) {
          if (p.file === m.file || isDepOf(m, p)) {
            await hot(ctx.server, p)
            return []
          }
        }
      }
      return
    },
    async configureServer(server) {
      await entry(server, p.entry)
      await server.transformRequest(p.entry)

      server.middlewares.use(async (req, res, next) => {
        if (!req.url) return next()

        if (req.url.includes(p.entry) || req.url.includes(p.entry.replace('.ts', '.js'))) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
          res.setHeader('Cache-Control', 'no-cache')
          return res.end(await entry(server, p.entry))
        }

        next()
      })

      strategy.handler?.call(this, server)
    },
  } satisfies Plugin
}

const memoTtl = <A extends any[], R>(ttl: number, fn: (...args: A) => Promise<R>) => {
  let last: { time: number; result: R } | undefined
  let running = false
  let task: Promise<R> | undefined
  return async (...args: A) => {
    const now = Date.now()
    if (last && now - last.time < ttl) return last.result
    if (running) return task!
    running = true
    task = fn(...args)
    const result = await task
    last = { time: now, result }
    running = false
    return result
  }
}

const serial = <A extends any[], R>(fn: (...args: A) => Promise<R>) => {
  let task: Promise<any> = Promise.resolve()
  return async (...args: A): Promise<R> => {
    task = Promise.resolve(task).then(() => fn(...args))
    return task
  }
}
