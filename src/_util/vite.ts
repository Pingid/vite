import { type ModuleNode, type ViteDevServer } from 'vite'

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
