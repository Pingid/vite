import type { ModuleNode, Plugin, ViteDevServer } from 'vite'

import type * as esbuild from 'esbuild'

import { isDepOf, resolveVirtualUrl } from '../_util/vite.ts'
import { bundler, CONST, Strategy } from './build/index.ts'

export type IifeOptions = {
  entry: string
  hot?: { kind: 'sse' } | { kind: 'hot'; name?: string }
  esbuild?: esbuild.BuildOptions
}

const SSE_URL = '/__hot_sse__'

export const iife = (p: IifeOptions) => {
  const virtualEntryId = 'virtual:dynamic-entry'
  const resolvedVirtualEntryId = '\0' + virtualEntryId

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
    const url = await resolveVirtualUrl(server, virtualEntryId)
    if (!url) return
    await server.transformRequest(url)
    console.timeEnd('tracks')
  })

  const entry = memoTtl(4_000, (server: ViteDevServer, pth: string) =>
    b.entry(pth, server.config).then((code) => (tracks(server), code)),
  )

  const toFile = () => {
    let code = 'void 2;'
    let i = 0
    for (const imp of tracking) {
      code += `import * as imp${i} from '${imp}';\n`
      code += `void imp${i}();\n`
      i++
    }
    return code
  }

  return {
    name: 'pingid:iife',
    enforce: 'pre',
    async config(c) {
      if (!c.build) c.build = {}
      if (!c.build.rolldownOptions) c.build.rolldownOptions = {}
      if (!c.build.rolldownOptions.input) c.build.rolldownOptions.input = {}
      if (typeof c.build.rolldownOptions.input === 'string')
        c.build.rolldownOptions.input = [c.build.rolldownOptions.input, virtualEntryId]
      else if (Array.isArray(c.build.rolldownOptions.input)) c.build.rolldownOptions.input.push(virtualEntryId)
      else if (typeof c.build.rolldownOptions.input === 'object')
        c.build.rolldownOptions.input[virtualEntryId] = virtualEntryId
      else {
      }
    },

    resolveId(id) {
      if (id === virtualEntryId) return resolvedVirtualEntryId
      if (id === `/@id/__x00__${virtualEntryId}` || id === `/__x00__${virtualEntryId}`) return resolvedVirtualEntryId
      return undefined
    },

    load(id) {
      if (id === resolvedVirtualEntryId || id === virtualEntryId || id.includes(virtualEntryId)) return toFile()
      return undefined
    },
    async handleHotUpdate(ctx) {
      const url = await resolveVirtualUrl(ctx.server, virtualEntryId)
      const virtualMod = url ? await ctx.server.moduleGraph.getModuleByUrl(url) : undefined
      if (!virtualMod) return console.warn('no virtual module for', url)
      const mods = Array.from(ctx.server.moduleGraph.getModulesByFile(ctx.file) ?? [])
      console.log(
        'handleHotUpdate',
        ctx.file,
        mods.map((m) => m.file),
        Array.from(virtualMod.importedModules).map((m) => m.file),
      )
      for (const p of virtualMod.importedModules) {
        for (const m of mods) {
          if (p.file === m.file || isDepOf(m, p)) {
            console.log('hot', p)
            await hot(ctx.server, p)
            return
          }
        }
      }
      return
    },
    async configureServer(server) {
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
