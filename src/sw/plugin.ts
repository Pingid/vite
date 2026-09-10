import type * as esbuild from 'esbuild'

import { iife } from '../iife/plugin.ts'

export type SwOptions = {
  worker: string
  esbuild?: esbuild.BuildOptions
}

export const sw = (p: SwOptions) => ({
  ...iife({ entry: p.worker, hot: { kind: 'sse' } }),
  name: 'pingid:sw',
})
