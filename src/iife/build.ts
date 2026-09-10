import type { ResolvedConfig } from 'vite'
import * as esbuild from 'esbuild'
import path from 'node:path'
import fs from 'node:fs'

import { File } from '../_util/file.ts'

/** Global the hot bundle assigns its namespace to, and which `new Function` returns. */
export const IDENT = '__pingid_iife'

/** A finished bundle, plus every absolute path esbuild read to produce it. */
export type Output = { code: string; deps: string[] }

const BASE: esbuild.BuildOptions = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  splitting: false,
  write: false,
  metafile: true,
  absPaths: ['metafile'],
}

/**
 * Vite's resolution and env, as far as esbuild can express them.
 *
 * `conditions` is the one that bites: this package asks consumers to set
 * `resolve.conditions: ['ts']`, and without forwarding it the bundle would
 * resolve `@pingid/vite` to `dist` while the page resolves it to `src`.
 *
 * `import.meta.env` is defined whole rather than key by key because under
 * `format: 'iife'` esbuild rewrites a bare `import.meta` to `{}` — defining
 * only `DEV`/`PROD`/`MODE` leaves every `VITE_*` var silently `undefined`.
 */
export const opts = (config: ResolvedConfig): esbuild.BuildOptions => ({
  ...BASE,
  absWorkingDir: config.root,
  conditions: config.resolve.conditions,
  mainFields: config.resolve.mainFields,
  resolveExtensions: config.resolve.extensions,
  // A service worker is undebuggable without this, and it costs nothing in dev.
  sourcemap: config.command === 'serve' ? 'inline' : false,
  minify: config.command === 'build',
  alias: aliases(config),
  define: {
    'import.meta.env': JSON.stringify(config.env),
    'process.env.NODE_ENV': JSON.stringify(config.isProduction ? 'production' : 'development'),
    ...defines(config.define),
  },
})

export const bundler = (config: ResolvedConfig, shared: esbuild.BuildOptions = {}) => {
  const base = merge(opts(config), shared)
  const runtime = spec(sibling('./runtime.ts'))

  const run = async (over: esbuild.BuildOptions): Promise<Output> => {
    const res = await esbuild.build({ ...base, ...over }).catch((e: unknown) => {
      throw new Error(`[pingid:iife] bundle failed\n${format(e)}`)
    })
    for (const w of res.warnings) config.logger.warn(`[pingid:iife] ${w.text}`)
    const code = res.outputFiles?.[0]?.text
    if (code === undefined) throw new Error('[pingid:iife] esbuild produced no output')
    // `<stdin>` and other synthetic inputs are not absolute, so they drop out here.
    const deps = Object.keys(res.metafile?.inputs ?? {}).filter((f) => path.isAbsolute(f))
    return { code, deps }
  }

  return {
    /**
     * The outer script the browser registers: the harness with `file` inlined.
     * Built once per dev-server run so its bytes stay stable — the browser
     * byte-compares a service worker script on every `register()` and update
     * check, and changing bytes queues a fresh install behind every edit.
     */
    shell: (file: string, hot: string | null) =>
      run({
        stdin: {
          contents: [
            `import { ${hot === null ? 'boot' : 'bootHot'} } from ${str(runtime)}`,
            `import * as mod from ${str(spec(file))}`,
            hot === null ? 'boot(mod)' : `bootHot(mod, ${str(hot)})`,
          ].join('\n'),
          resolveDir: config.root,
          sourcefile: 'pingid-iife-shell.js',
          loader: 'js',
        },
      }),

    /** `file` alone, for `new Function(code)()` inside the already-running script. */
    unit: async (file: string): Promise<Output> => {
      const out = await run({ entryPoints: [file], globalName: IDENT })
      const url = `/@pingid/iife/${spec(path.relative(config.root, file))}`
      return { ...out, code: `${out.code}\nreturn ${IDENT}\n//# sourceURL=${url}\n` }
    },
  }
}

export type Bundler = ReturnType<typeof bundler>

const merge = (base: esbuild.BuildOptions, over: esbuild.BuildOptions): esbuild.BuildOptions => ({
  ...base,
  ...over,
  alias: { ...base.alias, ...over.alias },
  define: { ...base.define, ...over.define },
})

/** esbuild `define` takes replacement source text; vite's config takes values. */
const defines = (define: Record<string, unknown> | undefined): Record<string, string> =>
  Object.fromEntries(Object.entries(define ?? {}).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]))

/** Only plain-string `find` aliases can cross over; anything else is reported, not silently dropped. */
const aliases = (config: ResolvedConfig): Record<string, string> => {
  const dropped: string[] = []
  const kept: Record<string, string> = {}
  for (const { find, replacement } of config.resolve.alias) {
    if (typeof find === 'string') kept[find] = replacement
    // Vite's own client aliases are regexes and irrelevant to a standalone
    // bundle, so reporting them would be pure noise on every build.
    else if (!INTERNAL.test(find.source)) dropped.push(String(find))
  }
  if (dropped.length)
    config.logger.warn(
      `[pingid:iife] esbuild cannot honour regex aliases, so these are ignored inside the bundle: ${dropped.join(', ')}`,
    )
  return kept
}

const format = (e: unknown) => {
  const errors = (e as { errors?: esbuild.Message[] }).errors
  if (!errors?.length) return e instanceof Error ? e.message : String(e)
  return errors.map((m) => `  ${m.location ? `${m.location.file}:${m.location.line} ` : ''}${m.text}`).join('\n')
}

/**
 * Path to one of this plugin's own runtime files.
 *
 * `import.meta` is this module's real location only while it stays a real
 * module. Vite bundles a config file's *relative* imports into a temp file, so
 * a plugin imported by source path from a vite config lands there and this
 * resolves to nothing — worth saying out loud rather than surfacing as an
 * esbuild resolve error.
 */
export const sibling = (rel: string): string => {
  const file = File.project(import.meta, rel).path
  if (!fs.existsSync(file))
    throw new Error(
      `[pingid:iife] cannot locate ${rel} at ${file} — import this plugin as ` +
        `"@pingid/vite/plugin/iife" rather than by a relative path, so vite does not inline it into its bundled config`,
    )
  return file
}

const INTERNAL = /@vite/

const spec = (p: string) => p.replaceAll('\\', '/')
const str = (s: string) => JSON.stringify(s)
