import { createHash } from 'node:crypto'
import type { Duplex } from 'node:stream'
import type { IncomingMessage } from 'node:http'

import { state } from './count'

export default async (request: Request): Promise<Response> => {
  const { pathname } = new URL(request.url)
  const route = pathname.replace(/^\/(api|fresh)/, '')

  if (route === '/count') return Response.json({ hits: ++state.hits, marker: 'one' })

  if (route === '/cookies') {
    const headers = new Headers()
    headers.append('set-cookie', 'a=1; Path=/')
    headers.append('set-cookie', 'b=2; Path=/')
    return new Response('ok', { headers })
  }

  if (route === '/echo') return new Response(request.body, { status: 201, statusText: 'Created' })

  if (route === '/slow') {
    const aborted = new Promise<string>((resolve) =>
      request.signal.addEventListener('abort', () => (console.log('[api] request aborted'), resolve('aborted'))),
    )
    return new Response(await Promise.race([aborted, new Promise<string>((r) => setTimeout(() => r('slept'), 3000))]))
  }

  if (route === '/hello') return new Response('<b>hello</b>', { headers: { 'content-type': 'text/html' } })

  return new Response('not found', { status: 404 })
}

/**
 * Minimal RFC 6455 handshake, so the example proves upgrade routing without
 * pulling in a websocket library.
 */
export const upgrade = (req: IncomingMessage, socket: Duplex, _head: Buffer) => {
  const key = req.headers['sec-websocket-key']
  if (typeof key !== 'string') return false

  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64')

  socket.write(
    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
  )

  const payload = Buffer.from('hello from the backend')
  socket.write(Buffer.concat([Buffer.from([0x81, payload.length]), payload]))
  return true
}
