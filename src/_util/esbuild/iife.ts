import type { ResolvedConfig } from 'vite'
import * as esbuild from 'esbuild'

export const bundle = async (p: {
  entryPath: string
  config: ResolvedConfig
  dev: boolean
  opts?: esbuild.BuildOptions
}): Promise<string> => {
  const result = await esbuild.build({
    absWorkingDir: p.config.root,
    entryPoints: [p.entryPath],
    bundle: true,
    format: 'iife',
    logLevel: 'silent',
    globalName: '__entry',
    platform: 'browser', // or 'node' depending on where new Function runs
    ...p.opts,
    write: false,
    target: 'es2022',
    metafile: true,
    splitting: false,
    alias: { ...staticAliases(p.config), ...p.opts?.alias },
    minify: !p.dev,
    sourcemap: p.dev ? 'inline' : false,
    define: {
      'import.meta.env.DEV': JSON.stringify(p.dev),
      'import.meta.env.PROD': JSON.stringify(!p.dev),
      'import.meta.env.MODE': JSON.stringify(p.config.mode),
      'process.env.NODE_ENV': JSON.stringify(p.dev ? 'development' : 'production'),
      ...p.opts?.define,
    },
  })

  const bundledCode = result.outputFiles[0]!.text

  return `
        ${bundledCode}
        return __entry;
      `
}

/** Vite aliases esbuild can honour: plain string `find` entries only. */
const staticAliases = (config: ResolvedConfig): Record<string, string> =>
  Object.fromEntries(
    config.resolve.alias.flatMap(({ find, replacement }) =>
      typeof find === 'string' ? [[find, replacement] as const] : [],
    ),
  )
