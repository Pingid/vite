import type { ServerHook } from 'vite'
import path from 'node:path'

import { HOT_ATTACHED, SSE_HEADER_NAME, SSE_HOT_EVENT } from '../const.ts'
import type { Injecter } from '../runner-plugin/index.ts'

export type Strategy = (
  entry: string,
  register: Register,
) => {
  inject: Injecter
  imported: () => string[]
  handler?: ServerHook
}

export type Register = (update: (data: SSE_HOT_EVENT) => void) => () => void

export const sse =
  (sseUrl: string): Strategy =>
  (entry, register) => {
    const handler: ServerHook = (server) => {
      server.middlewares.use((req, res, next) => {
        const name = req.headers[SSE_HEADER_NAME]
        if (typeof name !== 'string') return next()

        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('X-Accel-Buffering', 'no')
        res.statusCode = 200
        req.socket.setKeepAlive(true)

        const stop = register((data) => {
          if (data.target === name) res.write(`data: ${JSON.stringify(data)}\n\n`)
        })

        req.on('close', () => (stop(), res.end()))

        return
      })
    }

    return { ...base(entry, (x) => `${x}.sse('${sseUrl}')`), handler }
  }

export const hot =
  (name = '___hotrun_sse___'): Strategy =>
  (entry, register) => {
    const b = base(entry, (x) => `${x}.hot('${name}')`)
    return { ...b, handler: (server) => register((data) => server.hot.send(name, data)) }
  }

const base = (entry: string, fn: (x: string) => string) => {
  const ext = import.meta.filename.split('.').pop()
  const pt = path.resolve(import.meta.dirname, `./impl.${ext}`)
  const hotrunName = `___hotrun_sse___`

  let pths: string[] = []

  const i: Injecter = {
    ref: (imported, code) => {
      const full = path.resolve(path.dirname(entry), imported)
      pths.push(full)
      return `Object.assign(${code}, { ${HOT_ATTACHED}: ${fn(hotrunName)}('${full}') })`
    },
    transform: (code) => {
      if (pths.length === 0) return code
      return `import * as ${hotrunName} from '${pt}';\n${code}`
    },
  }
  return { inject: i, imported: () => [...pths] }
}

// export const broadcast =
//   (channel: string, host: string): Strategy =>
//   (entry, register) => ({
//     ...base(entry, (x) => `${x}.broadcast('${channel}')`),
//     handler: (server) => {
//       server.middlewares.use((req, res, next) => {
//         const name = req.headers[SSE_HEADER_NAME]
//         if (!req.url?.includes(host)) return next()

//         // res.setHeader('Content-Type', 'text/event-stream')
//         // res.setHeader('Cache-Control', 'no-cache')
//         // const result =
//       })
//     },
//   })
