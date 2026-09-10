import type { IncomingMessage, ServerResponse } from 'node:http';
/** A WHATWG request handler — the normal form this module works in. */
export type Fetch = (request: Request) => Response | Promise<Response>;
/** A Node/Connect-style handler, mounted as-is. */
export type Node = (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void;
export interface ToRequestOptions {
    /** Path and query to use instead of `req.url`. */
    url?: string;
    /** Aborted when the client disconnects; see {@link disconnect}. */
    signal?: AbortSignal;
}
/**
 * Node request → WHATWG `Request`.
 *
 * Vite ships nothing for this — the only `new Request(` in its dist is inside a
 * bundled proxy dependency — so the awkward parts are ours to get right.
 */
export declare const toRequest: (req: IncomingMessage, options?: ToRequestOptions) => Request;
/** WHATWG `Response` → Node response. Resolves once the body is flushed. */
export declare const sendResponse: (res: ServerResponse, response: Response) => Promise<void>;
/**
 * Aborted when the client goes away before the response finished.
 *
 * Keyed on the *response* closing unfinished rather than the request stream,
 * which also closes on a perfectly normal completed request.
 */
export declare const disconnect: (res: ServerResponse) => AbortSignal;
/** Mounts a fetch handler as Node middleware. */
export declare const toNode: (fetch: Fetch, options?: {
    url?: (req: IncomingMessage) => string;
}) => Node;
//# sourceMappingURL=node.d.ts.map