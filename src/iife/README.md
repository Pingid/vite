# IIFE entries

Bundle a file and everything it imports into one self-contained classic script, served in dev and
emitted as an asset in a build. Edit the file and the _running_ script picks up the change — no
reload, and for a service worker, no re-registration.

This exists for scripts that cannot be an ES module graph served by Vite: service workers, classic
`Worker`s, injected scripts, anything evaluated outside the page's module system.

## Setup

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { iife } from '@pingid/vite/plugin/iife'

export default defineConfig({
  plugins: [iife({ sw: './src/sw.ts' })],
})
```

The plugin writes an ambient declaration to `src/iife.d.ts` (rewritten only when it changes, so the
dev watcher doesn't loop). Make sure it's covered by your `tsconfig.json` `include`.

## The entry contract

An entry default-exports its setup and hands back its teardown:

```ts
// src/sw.ts
export default () => {
  const onFetch = (event: FetchEvent) => {
    /* ... */
  }
  addEventListener('fetch', onFetch)

  return () => removeEventListener('fetch', onFetch)
}
```

That's the whole convention. The teardown is what makes the entry swappable: on an edit the previous
teardown runs, then the new setup. Anything you don't unwind in the teardown leaks one copy per edit.

Setup runs during the script's **initial evaluation**, which is deliberate — a service worker only
claims functional events like `fetch` if a listener is registered by the time evaluation finishes.

`iife:<key>` gives you the script's URL:

```ts
// src/main.ts
import url from 'iife:sw'

navigator.serviceWorker.register(url, { updateViaCache: 'none' })
```

Entries are served and emitted at the root by default — `sw` becomes `/sw.js`. That matters for
service workers specifically: scope is derived from the script's path, so a worker served from a
nested path would never control the app. Override with `fileName` if a key collides with a route
(the response also carries `Service-Worker-Allowed`, so a nested path can still claim root scope).

## How the swap works

Two bundles per entry:

- the **script** the browser loads, with the entry inlined. Built once per dev-server run, so its
  bytes never change during a session. This is not an optimisation — the browser byte-compares a
  service worker script on every `register()` and update check, and moving bytes would queue a
  fresh install behind every edit.
- the **entry alone**, rebuilt on every change and pulled in by the running script.

esbuild's inputs are registered with `addWatchFile`, so they become real module-graph edges of the
`iife:<key>` module. Editing any of them invalidates that module and stops there, because it
self-accepts — the page doesn't reload. Its body then nudges the worker over `postMessage`, and the
worker fetches the current entry bundle and swaps it in.

The nudge travels on Vite's own HMR channel, so there's no second transport to configure. `message`
is a functional event, so it revives a dormant worker — which is why this works where a worker
holding a stream open does not: the browser terminates an idle worker within seconds.

The running script also pulls on startup. That's what covers a restart: the browser re-evaluates a
terminated worker from its _stored_ script, which is the bundle as of registration, so the inlined
copy can be behind. Setup runs from that copy first (synchronously, so events are claimed), then
the pull brings it current.

## Things to know

- **Adding an event needs a reinstall.** The browser decides at install time whether the worker
  handles `fetch` at all. Hot-swapping in a `fetch` listener where there wasn't one before won't
  intercept anything until the worker reinstalls — unregister, or hard-reload.
- **Module state isn't shared** between the inlined copy and a swapped one. A dep imported by both
  ends up with two instances, so module-level caches and `instanceof` across the boundary diverge.
  Dev only.
- **Swaps use `new Function`.** If something puts a `Content-Security-Policy` on the script
  response, it needs `'unsafe-eval'`.
- **A shared file does both.** Edit something the page and the entry both import and the page HMRs
  normally _and_ the worker swaps.
- **`node_modules` isn't watched.** Vite's watcher ignores it, so edits to a linked workspace dep
  won't push until you loosen `server.watch.ignored`.
- **Regex aliases don't cross over.** esbuild only honours plain-string `resolve.alias` entries;
  anything else is reported at startup and ignored inside the bundle.
- The generated script is served ahead of Vite's public-dir handler, so a same-named file in
  `public/` won't shadow it.

## What the build does

The entry is bundled with the same esbuild config as dev and emitted with `emitFile`, so it lands
at a fixed, unhashed path and the registration URL stays stable. `iife:<key>` resolves to that path.

The whole dev transport is _absent_, not merely unreachable: a build's script calls a different
harness entry point, so the pull, the message listener and `new Function` are never bundled.

## Options

```ts
iife(
  {
    sw: './src/sw.ts',
    other: { file: './src/other.ts', fileName: 'nested/other.js' },
  },
  {
    pkg: '@pingid/vite', // excluded from dep optimisation
    types: 'src/iife.d.ts', // false to skip generation
    esbuild: {}, // merged into every entry's build
  },
)
```
