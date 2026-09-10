# Backend apps

Mount a server app inside the Vite dev server, so `/api/*` is handled by real application code that
picks up edits with no restart. The app is loaded through Vite's own SSR pipeline, so it gets the
same transforms, aliases and resolution as the rest of the project.

Nothing here knows about any framework. The one library-specific fact — which function on your
module handles a request — is a single option, which is what makes an integration a couple of lines
rather than a plugin.

## Setup

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { serve } from '@pingid/vite/plugin/server'

export default defineConfig({
  plugins: [
    serve({
      '/api': './src/server.ts',
      '/auth': { file: './src/auth.ts', export: 'app', preview: './dist/server/auth.js' },
    }),
  ],
})
```

The keys are mount paths. Matching is on a path boundary, so `/api` claims `/api` and `/api/x` but
never `/apifoo`.

## The handler contract

Your module exports a request handler. Both shapes work:

```ts
// src/server.ts — a fetch handler, the normal form
export default (request: Request) => Response.json({ ok: true })
```

```ts
// src/legacy.ts — a Node handler, mounted as-is
export default (req, res, next) => res.end('hi')
```

Detection is standards-only: a bare function, or an object with a `fetch` method — the
`export default { fetch }` shape shared by Cloudflare, Bun and Deno. A bare function is treated as
fetch-style unless it declares two or more parameters, which means Node-style. Set
`kind: 'fetch' | 'node'` when that guess is wrong.

Anything else is one line of `handler`, and this is how you integrate a framework:

```ts
// Elysia
serve({ '/api': './src/server.ts' }, { handler: (m) => (r: Request) => m.default.handle(r) })

// Hono, Bun-style — already detected, no handler needed
export default app // app.fetch is found automatically
```

`handler` receives the whole loaded module, so it can reach any export.

## Reloading

There is no invalidation logic here, deliberately. Vite's watcher already nulls the transform result
for whatever changed, its module graph already walks importers to propagate that, and the SSR runner
already re-evaluates only what went stale. So the entry is simply re-imported per request.

The consequence worth knowing: **your module's top-level state survives requests.** A connection
pool, a cache, a rate limiter is created once and reused, and is only rebuilt when you edit
something it actually depends on. A plugin that invalidates by hand tends to destroy that state on
every request.

### Ephemeral mounts

When you want the opposite — nothing reused, ever — set `fresh`:

```ts
serve({ '/api': { file: './src/server.ts', fresh: true } })
```

Every request re-transforms and re-evaluates the entry and everything it imports, so all top-level
state is rebuilt from scratch. Useful when a module holds state you'd rather not reason about
between requests, or when you want each request to behave exactly like a cold start.

Two limits are worth knowing before relying on it:

- **It resets your code, not the whole world.** Externalized dependencies never enter Vite's SSR
  module graph, and Node's ESM cache can't be cleared, so a `node_modules` package keeps its state
  regardless. Add it to `ssr.noExternal` if it must be reset too.
- **The graph is shared.** Two mounts that import the same file share that module, so a `fresh`
  mount evicts modules a non-`fresh` mount is also using. Give them separate entries if that
  matters.

In `vite preview` there is no transform step, so `fresh` instead imports the built entry under a new
URL each time. That works, but every version stays resident in Node's module registry — acceptable
for a local command, and the reason this isn't the default.

## Things to know

- **A `/` catch-all claims the HTML page too.** Prefix mounts are registered ahead of Vite's own
  middlewares, so they win over the public directory and `server.proxy`. A `/` mount instead
  registers _after_ them — it has to, or it would swallow `/@vite/client` and kill HMR — which means
  Vite still serves `/@vite/client` and your modules, but the page itself reaches your app. That is
  the right shape for a backend that renders its own HTML; include
  `<script type="module" src="/@vite/client">` in it and HMR works normally.
- **The prefix is not removed by default.** Your app sees `/api/users`, not `/users`. Set
  `strip: true` for Connect-style mount semantics.
- **Preview needs to be told where the build went.** This plugin does not build your server, so a
  mount without `preview` is skipped in `vite preview`, with a warning naming it at startup.
- **WebSockets are routed, not implemented.** A fetch handler cannot perform a Node upgrade
  handshake, and every framework does it differently, so your app supplies `upgrade` and does its
  own handshake. What you get here is the routing and the coexistence: Vite's own HMR socket (the
  `vite-hmr` and `vite-ping` subprotocols) is left strictly alone, and an upgrade this plugin does
  not claim is left open rather than destroyed, since a configured proxy may still want it. Upgrade
  wiring is skipped entirely in middleware mode, where Vite runs HMR on a server of its own.
- **Failures answer with a 500, not Vite's error overlay.** An HTML overlay page is the wrong reply
  to an API client. The error is logged through Vite's logger; use `onError` for full control,
  including `next(err)` if you do want the overlay.
- **`x-forwarded-proto` is honoured** when building the request URL, so a tunnelled dev server still
  produces `https://` URLs.

## What the build does

Nothing. This plugin only touches the dev and preview servers — there are no `resolveId`/`load`
hooks, no generated files and no build config. Building and running your server in production is
yours to arrange; point `preview` at the output so `vite preview` matches.

The Node ⇄ WHATWG bridge is available on its own if you need it outside Vite:

```ts
import { toRequest, sendResponse, toNode, disconnect } from '@pingid/vite/server/node'
```

It handles the parts that are easy to get wrong: multi-value and HTTP/2 pseudo headers, a streaming
request body with `duplex: 'half'`, `Set-Cookie` kept as separate headers rather than joined into one
malformed value, `statusText`, guarded piping, and an abort signal wired to client disconnect.

## Options

```ts
serve(
  {
    '/api': './src/server.ts',
    '/auth': { file: './src/auth.ts' },
  },
  {
    export: 'default', // named export carrying the app
    handler: undefined, // (mod) => handler — skips detection
    kind: undefined, // 'fetch' | 'node' — overrides arity detection
    strip: false, // true to remove the mount path
    fresh: false, // true to rebuild the entry on every request
    upgrade: undefined, // (mod) => upgrade handler, for websockets
    onError: undefined, // (error, req, res, next) => void
  },
)
```

Every option can be set per mount as well; the second argument is just the default for all of them,
which is what lets an integration set `handler` once.
