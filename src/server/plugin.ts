import type { Connect, Plugin, PreviewServer, ResolvedConfig, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

import { toNode, type Fetch, type Node } from './node.ts'

export type Mounts = Record<string, string | Mount>

/** A loaded module. Only the caller knows its shape, hence `any`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loaded = any

/** Handles a websocket upgrade. Return truthy to claim the socket. */
export type Upgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => boolean | void

export interface Mount {
  file: string
  /** Named export carrying the app. Default `default`. */
  export?: string
  /** Pull the handler off the loaded module yourself; skips detection entirely. */
  handler?: (mod: Loaded) => Fetch | Node
  /** Force the handler shape when arity detection guesses wrong. */
  kind?: 'fetch' | 'node'
  /** Drop the mount path before handing the request over. Default `false`. */
  strip?: boolean
  /**
   * Discard the entry and everything it imports before every request, so no
   * module is ever reused. Default `false`.
   *
   * Off, a module is re-evaluated only when it or one of its dependencies
   * changes, so top-level state persists. On, every request re-transforms and
   * re-evaluates from scratch and all state is rebuilt.
   */
  fresh?: boolean
  /** Built server entry, relative to vite root. Required for `vite preview`. */
  preview?: string
  /** Pull a websocket upgrade handler off the module. Omit for no upgrade handling. */
  upgrade?: (mod: Loaded) => Upgrade | undefined
  /** Full control of failures. Default: log and send a 500. */
  onError?: (error: unknown, req: IncomingMessage, res: ServerResponse, next: (e?: unknown) => void) => void
}

/** Defaults applied to every mount — which is how an integration sets `handler` once. */
export type ServeOptions = Omit<Mount, 'file' | 'preview'>

type Norm = Mount & { at: string }

/**
 * Mounts a backend app inside the vite dev and preview servers.
 *
 * The app is loaded through vite's SSR pipeline, so it gets the same transforms
 * and resolution as the rest of the project and picks up edits with no restart.
 */
export const serve = (mounts: Mounts, options: ServeOptions = {}): Plugin => {
  const list: Norm[] = Object.entries(mounts).map(([at, input]) => {
    const it = typeof input === 'string' ? { file: input } : input
    if (!at.startsWith('/')) throw new Error(`[pingid:server] mount path ${JSON.stringify(at)} must start with "/"`)
    return { ...options, ...it, at: at === '/' ? '/' : at.replace(/\/+$/, '') }
  })

  let config: ResolvedConfig

  /**
   * Deliberately not cached. Re-importing is what picks up an edit, and it is
   * cheap when nothing changed: vite's watcher nulls `transformResult` only for
   * what actually changed, and the runner re-evaluates only those modules. So a
   * module's top-level state — a pool, a cache — survives across requests.
   */
  const dev = (server: ViteDevServer, m: Norm) => {
    const file = path.resolve(config.root, m.file)
    if (m.fresh) evict(server, file)
    const runner = runnerOf(server)
    // Prefer the runner: in vite 6+ `ssrLoadModule` throws outright if a
    // framework swapped the ssr environment for a non-runnable one.
    return runner ? runner.import(file) : server.ssrLoadModule(file)
  }

  const built = new Map<string, Promise<unknown>>()
  const preview = (m: Norm) => {
    const file = path.resolve(config.root, m.preview as string)
    const href = pathToFileURL(file).href
    // Node's ESM registry can't be cleared, so a fresh instance means a URL it
    // hasn't seen. Every version stays resident — fine for a local command, and
    // the reason this isn't the default.
    if (m.fresh) return import(`${href}?t=${Date.now()}`) as Promise<unknown>
    const found = built.get(file)
    if (found) return found
    const next = import(href) as Promise<unknown>
    built.set(file, next)
    return next
  }

  const mount =
    (m: Norm, load: () => Promise<unknown>): Connect.NextHandleFunction =>
    (req, res, next) => {
      const url = route(m, req, config.base)
      if (url === null) return next()

      // Connect neither awaits handlers nor catches rejections, so dispatch stays
      // synchronous and every failure is routed by hand.
      void load().then(
        (mod) => {
          const handler = resolve(m, mod)
          if (handler.kind === 'node') return handler.run(req, res, next)
          return toNode(handler.run, { url: () => url })(req, res, next)
        },
        (error: unknown) => fail(config, m, error, req, res, next),
      )
      return
    }

  const upgrades = (server: ViteDevServer | PreviewServer, on: Norm[], load: (m: Norm) => Promise<unknown>) => {
    const wanted = on.filter((m) => m.upgrade)
    // No `httpServer` means middleware mode, where vite runs HMR on a server of
    // its own and the embedding server owns upgrades.
    if (!wanted.length || !server.httpServer) return

    server.httpServer.on('upgrade', (req, socket, head) => {
      // Vite claims an upgrade only for these two subprotocols on its base path,
      // and leaves everything else strictly alone — so mirror that and get out
      // of the way. Never `removeAllListeners('upgrade')`; that kills HMR.
      const protocol = req.headers['sec-websocket-protocol']
      if (protocol === 'vite-hmr' || protocol === 'vite-ping') return

      const m = wanted.find((it) => route(it, req, config.base) !== null)
      if (!m) return

      void load(m).then(
        (mod) => m.upgrade?.(mod)?.(req, socket, head),
        // An unclaimed socket is left open rather than destroyed: vite's proxy
        // may also be listening, and only Node's "no listeners at all" case is
        // safe to treat as terminal.
        (error: unknown) => config.logger.error(format(m, error)),
      )
    })
  }

  return {
    name: 'pingid:server',

    configResolved: (config_) => void (config = config_),

    configureServer(server) {
      // A `configureServer` body lands ahead of vite's own middlewares, which is
      // what a prefix mount wants — it beats the public dir and `server.proxy`.
      // A `/` catch-all there would swallow `/@vite/client` and kill HMR, so it
      // goes in the post hook instead, after vite has served its own routes.
      const [root, prefixed] = split(list)
      for (const m of prefixed) server.middlewares.use(mount(m, () => dev(server, m)))
      upgrades(server, list, (m) => dev(server, m))
      if (!root.length) return
      return () => {
        for (const m of root) server.middlewares.use(mount(m, () => dev(server, m)))
      }
    },

    configurePreviewServer(server) {
      // Nothing is built for us, so a mount can only be served in preview if it
      // was told where its output landed. Say so at startup rather than leaving
      // a route to fail per request.
      for (const m of list.filter((it) => !it.preview))
        config.logger.warn(
          `[pingid:server] "${m.at}" is not mounted in preview — set \`preview\` to its built server entry`,
        )

      const mountable = list.filter((m) => m.preview)
      const [root, prefixed] = split(mountable)
      for (const m of prefixed) server.middlewares.use(mount(m, () => preview(m)))
      upgrades(server, mountable, (m) => preview(m))

      if (!root.length) return
      return () => {
        for (const m of root) server.middlewares.use(mount(m, () => preview(m)))
      }
    },
  }
}

const split = (list: Norm[]): [root: Norm[], prefixed: Norm[]] => [
  list.filter((m) => m.at === '/'),
  list.filter((m) => m.at !== '/'),
]

type Node_ = { importedModules: Set<Node_> }
type Graph = {
  getModuleById?: (id: string) => Node_ | undefined
  getModulesByFile?: (file: string) => Set<Node_> | undefined
  invalidateModule: (mod: Node_) => void
}

/**
 * Nulls the transform result for the entry and everything below it, which is
 * what makes the next import re-transform and re-evaluate: the SSR runner
 * discards its evaluated copy of any module vite reports as invalidated.
 *
 * `invalidateModule` already walks *importers* on its own; the recursion here
 * goes the other way, down through `importedModules`.
 *
 * Externalized dependencies are untouched — they never enter this graph, and
 * Node's ESM cache holds them regardless. So `fresh` resets your code, not the
 * whole world.
 */
const evict = (server: ViteDevServer, file: string) => {
  const graph = graphOf(server)
  const roots = graph?.getModulesByFile?.(file)
  if (!graph || !roots) return
  const seen = new Set<Node_>()
  const drop = (mod: Node_) => {
    if (seen.has(mod)) return
    seen.add(mod)
    graph.invalidateModule(mod)
    for (const dep of mod.importedModules) drop(dep)
  }
  for (const root of roots) drop(root)
}

const graphOf = (server: ViteDevServer): Graph | undefined => {
  const envs = (server as unknown as { environments?: Record<string, { moduleGraph?: Graph } | undefined> })
    .environments
  // per-environment graph in vite 6+, the mixed facade before that
  return envs?.['ssr']?.moduleGraph ?? (server as unknown as { moduleGraph?: Graph }).moduleGraph
}

type Runner = { import: (url: string) => Promise<unknown> }

/**
 * Structural, not `isRunnableDevEnvironment`: that export doesn't exist before
 * vite 6 so a static import would hard-fail there, and it is an `instanceof`
 * check, which breaks across duplicated vite copies in a workspace.
 */
const runnerOf = (server: ViteDevServer): Runner | undefined => {
  const envs = (server as unknown as { environments?: Record<string, { runner?: Partial<Runner> } | undefined> })
    .environments
  const runner = envs?.['ssr']?.runner
  return typeof runner?.import === 'function' ? (runner as Runner) : undefined
}

/**
 * The path to hand the app, or `null` if this mount doesn't claim the request.
 *
 * Reads `originalUrl` because by the time a post-hook middleware runs, `req.url`
 * has been through `baseMiddleware` (base stripped) and possibly
 * `htmlFallbackMiddleware` (rewritten to `/index.html` for an HTML navigation).
 * `originalUrl` is set once at dispatch and survives both.
 */
const route = (m: Norm, req: IncomingMessage, base: string): string | null => {
  const raw = (req as Connect.IncomingMessage).originalUrl ?? req.url ?? '/'
  const q = raw.indexOf('?')
  const search = q === -1 ? '' : raw.slice(q)
  let pathname = q === -1 ? raw : raw.slice(0, q)

  if (base !== '/' && pathname.startsWith(base.slice(0, -1))) pathname = pathname.slice(base.length - 1) || '/'

  if (m.at === '/') return pathname + search
  // Path-boundary match, so `/api` never claims `/apifoo`.
  if (pathname !== m.at && !pathname.startsWith(`${m.at}/`)) return null

  return (m.strip ? pathname.slice(m.at.length) || '/' : pathname) + search
}

/**
 * Detection is standards-only — a bare function, or the `{ fetch }` shape
 * Cloudflare, Bun and Deno share. Anything framework-specific (Elysia's
 * `handle`, Express's `handle`) is one line of `handler`, kept out of here so
 * this module carries no library knowledge.
 */
const resolve = (m: Norm, mod: unknown): { kind: 'fetch'; run: Fetch } | { kind: 'node'; run: Node } => {
  const found = m.handler ? m.handler(mod) : detect(m, mod)
  // Fetch handlers take one argument; Node handlers take `(req, res, next)`.
  const kind = m.kind ?? (found.length >= 2 ? 'node' : 'fetch')
  return kind === 'node' ? { kind, run: found as Node } : { kind, run: found as Fetch }
}

const detect = (m: Norm, mod: unknown): Fetch | Node => {
  const name = m.export ?? 'default'
  const value = (mod as Record<string, unknown> | null | undefined)?.[name]
  if (typeof value === 'function') return value as Fetch | Node

  const fetch = (value as { fetch?: unknown } | null | undefined)?.fetch
  if (typeof fetch === 'function') return (fetch as Fetch).bind(value) as Fetch

  throw new Error(
    `[pingid:server] "${m.file}" has nothing usable on export "${name}" — expected a function, or an object ` +
      `with a \`fetch\` method. For anything else pass \`handler\`, e.g. \`handler: (m) => (r) => m.default.handle(r)\``,
  )
}

const fail = (
  config: ResolvedConfig,
  m: Norm,
  error: unknown,
  req: IncomingMessage,
  res: ServerResponse,
  next: (e?: unknown) => void,
) => {
  if (m.onError) return m.onError(error, req, res, next)

  config.logger.error(format(m, error))

  if (res.headersSent) return res.destroy(error instanceof Error ? error : new Error(String(error)))

  // Not `next(error)`: vite's error middleware answers with an HTML overlay
  // page, which is the wrong reply to an API client. `onError` opts into it.
  res.statusCode = 500
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end(format(m, error))
}

const format = (m: Norm, error: unknown) => {
  const e = error instanceof Error ? error : new Error(String(error))
  return `[pingid:server] ${m.at} — ${e.stack ?? e.message}`
}
