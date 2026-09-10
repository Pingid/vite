# server example

A backend mounted in the Vite dev server, with no framework involved.

```bash
pnpm install   # links @pingid/vite from the repo root
pnpm dev
```

- `GET /api/count` — increments module-level state, proving the module is reused across requests
  rather than re-evaluated per request. Edit `src/api.ts` and it resets; edit nothing and it climbs.
- `GET /api/cookies` — two separate `Set-Cookie` headers.
- `POST /api/echo` — streams the request body back with a custom `statusText`.
- `GET /api/slow` — logs when the client disconnects, via `request.signal`.
- `GET /fresh` — the same idea with `fresh: true`, so `hits` is always 1: the module and everything
  it imports are rebuilt per request.
- `GET /legacy/*` — a plain Node `(req, res, next)` handler, detected by arity.
- `ws://…/api/socket` — a hand-rolled RFC 6455 handshake, alongside Vite's own HMR socket.

For preview, the server entry has to be built too — this plugin doesn't do it for you:

```bash
pnpm build
npx esbuild src/api.ts --bundle --platform=node --format=esm --outfile=dist/server/api.js
pnpm preview
```
