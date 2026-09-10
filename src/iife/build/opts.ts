import type { ResolvedConfig } from 'vite'
import * as esbuild from 'esbuild'

export const mergeOpts = (base: esbuild.BuildOptions, opts: esbuild.BuildOptions) => ({
  ...base,
  ...opts,
  alias: { ...base.alias, ...opts?.alias },
  define: { ...base.define, ...opts?.define },
})

export const baseOpts: esbuild.BuildOptions = {
  bundle: true,
  format: 'iife',
  logLevel: 'silent',
  globalName: '__entry',
  platform: 'browser',
  write: false,
  target: 'es2022',
  metafile: true,
  splitting: false,
}

export const viteOpts = (config: ResolvedConfig) => ({
  ...baseOpts,
  absWorkingDir: config.root,
  alias: { ...staticAliases(config) },
  define: {
    'import.meta.env.DEV': JSON.stringify(config.dev),
    'import.meta.env.PROD': JSON.stringify(!config.dev),
    'import.meta.env.MODE': JSON.stringify(config.mode),
    'process.env.NODE_ENV': JSON.stringify(config.dev ? 'development' : 'production'),
  },
})

/** Vite aliases esbuild can honour: plain string `find` entries only. */
const staticAliases = (config: ResolvedConfig): Record<string, string> =>
  Object.fromEntries(
    config.resolve.alias.flatMap(({ find, replacement }) =>
      typeof find === 'string' ? [[find, replacement] as const] : [],
    ),
  )
