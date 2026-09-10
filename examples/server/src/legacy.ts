import type { IncomingMessage, ServerResponse } from 'node:http'

/** Arity 3, so it's detected as a Node handler with no `kind` needed. */
export default (req: IncomingMessage, res: ServerResponse, _next: () => void) => {
  res.setHeader('content-type', 'text/plain')
  res.end(`legacy saw ${req.url}`)
}
