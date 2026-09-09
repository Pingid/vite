import { type Plugin } from 'vite'

const name = 'pingid:aliases'

export const alias = (p: Record<string, string | ((x: string) => string)>) => {
  const aliases = Array.from(
    Object.entries(p).map(([find, replacement]) => ({
      find,
      replacement: typeof replacement === 'string' ? () => replacement : replacement,
    })),
  )
  return { name, configureServer: configureServer(aliases) } satisfies Plugin
}

const configureServer = (aliases: { find: string; replacement: (x: string) => string }[]) => {
  const configureServer = ((server) => {
    if (aliases.length > 0) {
      server.middlewares.use(async (req, _res, next) => {
        if (!req.url) return next()
        for (const { find, replacement } of aliases) {
          if (req.url.includes(find)) {
            req.url = req.url.replace(find, replacement(req.url))
            break
          }
        }
        next()
      })
    }
  }) satisfies Plugin['configureServer']
  return configureServer
}
