import { type ModuleNode, type Plugin, type ViteDevServer } from 'vite'

export const isDepOf = (
  currentMod: ModuleNode | undefined,
  ancestorMod: ModuleNode,
  visited = new Set<ModuleNode>(),
): boolean => {
  if (!currentMod || visited.has(currentMod)) return false
  visited.add(currentMod)
  for (const importer of currentMod.importers) {
    if (importer === ancestorMod) return true
    if (isDepOf(importer, ancestorMod, visited)) return true
  }
  return false
}

export const resolveVirtualUrl = async (server: ViteDevServer, virtualId: string): Promise<string | undefined> => {
  const resolved = await server.pluginContainer.resolveId(virtualId)
  if (!resolved) return undefined
  return resolved.id.startsWith('\0') ? `/@id/__x00__${resolved.id.slice(1)}` : resolved.id
}

// type Virtual = { id: string; resolved: string; url: string }

export const virtual = (name: string) => {
  const id = `virtual:${name}`
  const resolved = '\0' + id
  const url = `/@id/__x00__${id}`
  const resolver = (
    cb: (c: PluginContext, source: string, importer: string | undefined) => ResolveIdResult = (_, s) =>
      s.endsWith(id) ? resolved : undefined,
    or?: (c: PluginContext, source: string, importer: string | undefined) => ResolveIdResult,
  ): Plugin['resolveId'] =>
    function (this: PluginContext, source: string, importer: string | undefined) {
      const result = cb(this, source, importer)
      if (result !== undefined) return result
      return or?.(this, source, importer)
    }
  const loader = (
    cb: (c: PluginContext) => LoadResult,
    or?: (c: PluginContext, id: string) => LoadResult,
  ): Extract<Plugin['load'], Function> =>
    function (this, id) {
      if (id === resolved) {
        const result = cb(this)
        if (result !== undefined) return result
      }
      return or?.(this, id)
    }
  return { id, resolved, url, resolver, loader } as const
}

// export const resolver = <

type PluginContext = ThisParameterType<Extract<Plugin['resolveId'], Function>>
type LoadResult = ReturnType<Extract<Plugin['load'], Function>>
type ResolveIdResult = ReturnType<Extract<Plugin['resolveId'], Function>>

// export function myHmrPlugin(name = 'custom-event'): Plugin {
//   const virtualId = 'virtual:my-hmr-client'
//   const resolvedVirtualId = '\0' + virtualId

//   return {
//     name: 'my-hmr-listener',

//     resolveId(id) {
//       if (id === virtualId) return resolvedVirtualId
//     },

//     load(id) {
//       if (id === resolvedVirtualId) {
//         // Here Vite transforms the module and properly populates import.meta.hot
//         return `
//           if (import.meta.hot) {
//             import.meta.hot.on('${name}', (data) => {
//               console.log('hotter', data)
//             })
//           }
//         `
//       }
//     },

//     transformIndexHtml() {
//       return [
//         {
//           tag: 'script',
//           attrs: {
//             type: 'module',
//             // Use Vite's dev-server ID format so the browser requests it as a module
//             src: `/@id/__x00__${virtualId}`,
//           },
//           injectTo: 'body',
//         },
//       ]
//     },
//   }
// }
