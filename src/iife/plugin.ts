import { type Plugin, type ResolvedConfig } from 'vite'
import type * as esbuild from 'esbuild'

import { bundle, inlineImports } from '../_util/esbuild/index.ts'
import { isDep } from '../_util/vite.ts'
import { SW_UPDATE } from './const.ts'

export type IifeOptions = {
  entrypoint: string
  esbuild?: esbuild.BuildOptions
}

export const iife = (p: IifeOptions) => {
  let config: ResolvedConfig

  return {
    name: 'pingid:iife',
    configResolved(resolved) {
      config = resolved
    },

    handleHotUpdate(up) {
      if (up.file === p.entrypoint) return []
      const mod = up.server.moduleGraph.getModuleById(up.file)
      if (mod && isDep(mod, p.entrypoint)) return []
      return up.modules
    },

    async configureServer(server) {
      server.watcher.add(p.entrypoint)

      const changed = async () => {
        const code = await bundle({
          entryPath: p.entrypoint,
          dev: false,
          opts: { plugins: [inlineImports({ onImport: (x) => console.log('imported', x) })], ...p.esbuild },
          config,
        })
        server.hot.send(SW_UPDATE.type, SW_UPDATE.make({ code, entrypoint: p.entrypoint }))
      }

      server.watcher.on('change', async (filePath) => {
        if (filePath === p.entrypoint) return changed()
        const changedMod = server.moduleGraph.getModuleById(filePath)
        if (!changedMod) return
        if (isDep(changedMod, p.entrypoint)) return changed()
      })
    },
  } satisfies Plugin
}
