import type { ResolvedConfig } from 'vite'
import * as esbuild from 'esbuild'

import { createHotRunnerPlugin } from './runner-plugin/index.ts'
import type { Strategy } from './strategy/index.ts'
import { mergeOpts, viteOpts } from './opts.ts'

export * as Strategy from './strategy/index.ts'
export * as CONST from './const.ts'

export const bundler = (p: { url: string; opts?: esbuild.BuildOptions; strategy: ReturnType<Strategy> }) => {
  const entry = async (pth: string, config: ResolvedConfig) => {
    const base = mergeOpts(viteOpts(config), p.opts ?? {})
    const result = await esbuild.build({
      ...base,
      plugins: [...(base.plugins ?? []), createHotRunnerPlugin(pth, p.strategy.inject)],
      entryPoints: [pth],
    })
    return result.outputFiles![0]!.text
  }

  const hot = async (pth: string, config: ResolvedConfig) => {
    const base = mergeOpts(viteOpts(config), p.opts ?? {})
    const result = await esbuild.build({ ...base, entryPoints: [pth] })
    return `${result.outputFiles![0]!.text} return ${base.globalName}`
  }

  return { entry, hot }
}
