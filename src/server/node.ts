import type { IncomingMessage, ServerResponse, OutgoingHttpHeaders } from 'node:http'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

/** A WHATWG request handler — the normal form this module works in. */
export type Fetch = (request: Request) => Response | Promise<Response>

/** A Node/Connect-style handler, mounted as-is. */
export type Node = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void

export interface ToRequestOptions {
  /** Path and query to use instead of `req.url`. */
  url?: string
  /** Aborted when the client disconnects; see {@link disconnect}. */
  signal?: AbortSignal
}

/**
 * Node request → WHATWG `Request`.
 *
 * Vite ships nothing for this — the only `new Request(` in its dist is inside a
 * bundled proxy dependency — so the awkward parts are ours to get right.
 */
export const toRequest = (req: IncomingMessage, options: ToRequestOptions = {}): Request => {
  const url = `${scheme(req)}://${authority(req)}${options.url ?? req.url ?? '/'}`

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    // HTTP/2 pseudo-headers (`:method`, `:authority`, …) reach us through Node's
    // compat layer, and `Headers` rejects a name starting with a colon.
    if (value === undefined || key.startsWith(':')) continue
    if (Array.isArray(value)) for (const v of value) headers.append(key, v)
    else headers.set(key, value)
  }

  const method = req.method ?? 'GET'
  const bodied = method !== 'GET' && method !== 'HEAD'

  return new Request(url, {
    method,
    headers,
    signal: options.signal,
    body: bodied ? (Readable.toWeb(req) as unknown as BodyInit) : undefined,
    // Node requires this for a streaming body and the DOM lib doesn't declare
    // it, so widen the init rather than reaching for `@ts-expect-error`.
    ...({ duplex: 'half' } as object),
  })
}

/** WHATWG `Response` → Node response. Resolves once the body is flushed. */
export const sendResponse = async (res: ServerResponse, response: Response): Promise<void> => {
  const headers: OutgoingHttpHeaders = {}
  response.headers.forEach((value, key) => {
    if (key !== 'set-cookie') headers[key] = value
  })

  // `Headers.forEach` yields multiple Set-Cookie values joined into one string,
  // which Node then writes as a single malformed header — breaking any library
  // that sets more than one cookie. `getSetCookie` keeps them separate.
  const cookies = getSetCookie(response.headers)
  if (cookies.length) headers['set-cookie'] = cookies

  res.writeHead(response.status, response.statusText || undefined, headers)

  if (!response.body) return void res.end()

  // `pipeline` (not `.pipe`) so a stream failure destroys both ends instead of
  // hanging the response with headers already sent.
  await pipeline(Readable.fromWeb(response.body as unknown as NodeReadableStream), res)
}

/**
 * Aborted when the client goes away before the response finished.
 *
 * Keyed on the *response* closing unfinished rather than the request stream,
 * which also closes on a perfectly normal completed request.
 */
export const disconnect = (res: ServerResponse): AbortSignal => {
  const controller = new AbortController()
  res.once('close', () => {
    if (!res.writableFinished) controller.abort()
  })
  return controller.signal
}

/** Mounts a fetch handler as Node middleware. */
export const toNode =
  (fetch: Fetch, options: { url?: (req: IncomingMessage) => string } = {}): Node =>
  (req, res, next) => {
    // Connect neither awaits handlers nor catches their rejections, so an
    // unrouted failure here would hang the request.
    void (async () => {
      const request = toRequest(req, { url: options.url?.(req), signal: disconnect(res) })
      await sendResponse(res, await fetch(request))
    })().catch((error: unknown) => {
      if (res.headersSent) res.destroy(error instanceof Error ? error : new Error(String(error)))
      else next(error)
    })
  }

/** Honours `x-forwarded-proto` so a tunnelled dev server still builds https URLs. */
const scheme = (req: IncomingMessage) => {
  const forwarded = one(req.headers['x-forwarded-proto'])
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'http'
  return (req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http'
}

const authority = (req: IncomingMessage) =>
  one(req.headers['host']) ?? one(req.headers[':authority' as keyof typeof req.headers]) ?? 'localhost'

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

const getSetCookie = (headers: Headers): string[] => {
  const get = (headers as { getSetCookie?: () => string[] }).getSetCookie
  if (typeof get === 'function') return get.call(headers)
  const single = headers.get('set-cookie')
  return single ? [single] : []
}
