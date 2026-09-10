import type { Plugin, ResolvedConfig } from 'vite'
import type * as esbuild from 'esbuild'
import type { ServerResponse } from 'node:http'
import path from 'node:path'

import { namespace } from '../_util/vite.ts'
import { Jitt } from '../_util/shared.ts'
import { File } from '../_util/file.ts'
import { bundler, sibling, type Bundler, type Output } from './build.ts'

const NS = namespace('iife')

export type Entries = Record<string, string | Entry>

export type Entry = {
  file: string
  /** Served and emitted at `<base><fileName>`. Default `<key>.js`. */
  fileName?: string
  esbuild?: esbuild.BuildOptions
}

export interface IifeOptions {
  /** Package name of this library, excluded from dep optimisation. Default `@pingid/vite`. */
  pkg?: string
  /** Where to write the ambient declaration, relative to vite root. `false` to skip. Default `src/iife.d.ts`. */
  types?: string | false
  /** Merged into every entry's esbuild options. */
  esbuild?: esbuild.BuildOptions
}

type Mod = { key: string; raw: string; file: string; fileName: string; esbuild?: esbuild.BuildOptions }

/**
 * Bundles an entry and everything it imports into one self-contained classic
 * script, serves it in dev and emits it as an asset in a build.
 *
 * The entry default-exports its setup and hands back teardown, which is what
 * makes it hot-swappable: on an edit the entry is rebuilt on its own and pushed
 * into the *running* script, where the previous teardown runs before the new
 * setup. Nothing re-registers and no install cycle happens.
 */
export const iife = (entries: Entries, options: IifeOptions = {}): Plugin => {
  const pkg = options.pkg ?? '@pingid/vite'

  const mods = new Map<string, Mod>(
    Object.entries(entries).map(([key, input]) => {
      if (key.includes('/')) throw new Error(`[pingid:iife] entry key ${JSON.stringify(key)} must not contain "/"`)
      const it = typeof input === 'string' ? { file: input } : input
      // `file` is resolved against the vite root in `configResolved`, not against
      // cwd here — the two are only the same when vite runs from the project dir.
      return [key, { ...it, key, raw: it.file, file: it.file, fileName: it.fileName ?? `${key}.js` }]
    }),
  )

  let config: ResolvedConfig
  let build: Bundler

  /**
   * Built once per dev-server run, on purpose. The browser byte-compares a
   * service worker script on every `register()` and update check, so rebuilding
   * this per request would queue a spurious install behind every edit. The
   * inlined copy going stale is harmless — the harness pulls current code on
   * startup.
   */
  const shells = new Map<string, Promise<Output>>()

  const script = (m: Mod) => `${config.base}${m.fileName}`
  const hot = (m: Mod) => (config.command === 'serve' ? `${config.base}@iife/${m.key}.js` : null)

  const shell = (m: Mod) => {
    const found = shells.get(m.key)
    if (found) return found
    const next = build.shell(m.file, hot(m))
    shells.set(m.key, next)
    return next
  }

  /**
   * Never cached. This is the answer to "what is the current code", and the
   * harness asks on every startup — including after a browser-initiated restart
   * with no page open, when nothing has invalidated `load`.
   */
  const unit = (m: Mod) => build.unit(m.file)

  return {
    name: 'pingid:iife',
    enforce: 'pre',

    config: () => ({
      // `import.meta.hot` in the generated module has to survive, so the page
      // half of this plugin must not be pre-bundled.
      optimizeDeps: { exclude: [pkg] },
      ssr: { noExternal: [pkg] },
    }),

    configResolved: async (config_) => {
      config = config_
      build = bundler(config_, options.esbuild)
      for (const m of mods.values()) m.file = path.resolve(config_.root, m.raw)

      if (options.types === false) return
      const file = File.for(config_.root, options.types ?? 'src/iife.d.ts')
      await file.write(decls([...mods.values()]))
    },

    buildStart: async function () {
      if (config.command !== 'build') return
      for (const m of mods.values()) {
        const out = await shell(m)
        this.emitFile({ type: 'asset', fileName: m.fileName, source: out.code })
      }
    },

    resolveId: {
      order: 'pre',
      handler(id) {
        return NS.match(id, (m) => {
          if (mods.has(m.name)) return m.encoded
          return this.error(`unknown iife entry "${m.name}" — known keys: ${[...mods.keys()].join(', ') || '(none)'}`)
        })
      },
    },

    load: {
      order: 'pre',
      async handler(id) {
        return NS.match(id, async (m) => {
          const mod = mods.get(m.name)
          if (!mod) return null

          if (config.command === 'serve') {
            const out = await unit(mod)
            // esbuild's inputs become real module-graph edges, so editing any of
            // them invalidates this module — and stops there, because the module
            // below self-accepts.
            for (const dep of out.deps) this.addWatchFile(dep)
          }

          return wrapper(mod, script(mod), hot(mod))
        })
      },
    },

    configureServer: (server) => {
      const routes = new Map<string, { mod: Mod; kind: 'shell' | 'unit' }>()
      for (const m of mods.values()) {
        routes.set(script(m), { mod: m, kind: 'shell' })
        routes.set(`${config.base}@iife/${m.key}.js`, { mod: m, kind: 'unit' })
      }

      // Registered from a `configureServer` body, so this lands ahead of vite's
      // own middlewares — including the public-dir handler, which means a stale
      // `public/<fileName>` cannot shadow the generated script.
      server.middlewares.use((req, res, next) => {
        const route = routes.get((req.url ?? '').split('?')[0] ?? '')
        if (!route) return next()

        const build_ = route.kind === 'shell' ? shell(route.mod) : unit(route.mod)
        void build_.then(
          (out) => {
            res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
            res.setHeader('Cache-Control', 'no-store')
            // Lets a non-root `fileName` still claim root scope.
            if (route.kind === 'shell') res.setHeader('Service-Worker-Allowed', config.base)
            res.end(out.code)
          },
          (e: unknown) => fail(res, e, config),
        )
        return
      })
    },
  }
}

const fail = (res: ServerResponse, e: unknown, config: ResolvedConfig) => {
  const message = e instanceof Error ? e.message : String(e)
  config.logger.error(message)
  res.statusCode = 500
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end(message)
}

/**
 * What `iife:<key>` resolves to on the page: the script URL, plus — in dev only
 * — the relay that carries vite's own HMR through to the worker.
 *
 * The URL deliberately carries no version, so re-running this body cannot
 * trigger a re-registration; the nudge is the only effect.
 */
const wrapper = (mod: Mod, url: string, hot: string | null) => {
  const w = Jitt.create()
  if (hot) w.ln(`import { ping } from ${Jitt.str(sibling('./client.ts'))}`)
  w.ln(`const url = ${Jitt.str(url)}`)
  w.ln('export default url')

  if (hot) {
    w.ln('if (import.meta.hot)')
    w.block(() => {
      w.ln('import.meta.hot.accept()')
      w.ln(`if (import.meta.hot.data.booted) ping(${Jitt.str(hot)})`)
      w.ln('import.meta.hot.data.booted = true')
    })
  }

  return `${w.toString()}\n// ${mod.key}\n`
}

const decls = (mods: Mod[]) => {
  const w = Jitt.create()
  w.ln('// Generated by @pingid/vite. Do not edit.')
  mods.forEach((m) => {
    // Single-quoted so the generated file is already prettier-clean and
    // `pnpm format` doesn't fight the next dev start over it.
    w.ln(`declare module '${NS.unknown(m.key).id}'`)
    w.block(() => {
      w.ln('/** URL of the self-contained script built from this entry. */')
      w.ln('const url: string')
      w.ln('export default url')
    })
  })
  return `${w.toString()}\n`
}
