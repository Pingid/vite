# Virtual modules

Bind a key to a file in `vite.config.ts`, load it by key at runtime, and get HMR for it in dev without reloading the page. Library code depends on the key; the app decides which file it points at.

## Setup

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { virtual } from '@pingid/vite'

export default defineConfig({
  plugins: [
    virtual({
      routes: './src/routes.ts',
      worker: { file: './src/worker.ts', exports: ['handler'] },
    }),
  ],
})
```

The plugin writes an ambient declaration to `src/virtual.d.ts` (rewritten only when it changes, so the dev watcher doesn't loop). Make sure it's covered by your `tsconfig.json` `include`.

## Styles

`style` picks how application code reaches a key. Both styles share one wrapper, one runtime and one HMR path — they differ only in how a key is addressed and typed. Pick one per project; the two cannot run side by side, because they claim the same `virtual:` ids.

### `manifest` (default) — keys are values

The plugin emits a manifest module that the client reads, so the key is an ordinary argument. Use this when the key is chosen at runtime, or when you want one call site to handle several modules.

```ts
// src/virtual.d.ts — generated
declare module '@pingid/vite/types' {
  export interface VirtualModule {
    routes: typeof import('./routes')
    worker: Pick<typeof import('./worker'), 'handler'>
  }
}
```

`run` takes a key and a callback. The callback receives the module and returns a disposer.

```ts
import { run } from '@pingid/vite/virtual'

const routes = run('routes', (mod) => {
  const server = listen(mod.routes)
  return () => server.close()
})
```

Keys and module shapes are typed from the generated declaration, so `mod.routes` is checked and an unknown key is a compile error.

`VirtualMod` is a thenable that resolves to the module:

```ts
const { handler } = await run('worker', (mod) => mod.handler.start())
```

Dispose explicitly, or let the scope do it:

```ts
{
  await using worker = run('worker', (mod) => mod.handler.start())
  // ...
} // disposed here

const routes = run('routes', register)
routes.dispose()
```

Disposing detaches the callback for good — including across hot updates that happened after `run` was called. Disposing before the module has loaded cancels it and rejects the promise.

### `module` — keys are import specifiers

```ts
virtual({ routes: './src/routes.ts' }, { style: 'module' })
```

No manifest and no client: each key resolves statically as `virtual:<key>`, and the wrapper's `register` is imported directly.

```ts
// src/virtual.d.ts — generated
declare module 'virtual:routes' {
  export type Mod = typeof import('./routes')
  export const mod: Mod
  export const register: (cb: (mod: Mod) => (() => void) | void) => () => void
}
```

```ts
import { register, mod } from 'virtual:routes'

const stop = register((mod) => {
  const server = listen(mod.routes)
  return () => server.close()
})
```

`mod` is the current module, if you only want the value and not the update hook. Importing `@pingid/vite/virtual` under this style is a resolve-time error, since there is no manifest to read.

## Callback semantics

In both styles the callback fires immediately on load, and again on every hot update: the previous disposer runs first, then the callback re-runs with the new module. Your side effects are torn down and rebuilt; nothing else on the page moves.

## Narrowing exports

`exports` on a module entry pulls only those bindings into the chunk, so the rest of the file tree-shakes away:

```ts
virtual({ worker: { file: './src/worker.ts', exports: ['handler'] } })
```

This is a config-time decision, not a call-site one — the bundler has to know it statically. The generated type narrows to a matching `Pick<>`, so reaching for anything else is a compile error rather than a runtime `undefined`.

## What the build does

Under `manifest`, each key becomes one statically analysable dynamic import in the graph, so rolldown code-splits it into its own lazy chunk, hoists dependencies it shares with the app into shared chunks, hashes the filename and emits the right preload hints. Nothing is added to `build.rollupOptions.input` and no runtime path map is injected. Under `module`, the import is static, so the key lands in whatever chunk imports it — reach for `import('virtual:key')` if you want it split out.

In a build `import.meta.hot` is undefined, so the update path drops out and registration reduces to "call the callback once, hand back a disposer". Dev and production take the same code path through the same runtime — there is no separate build-mode client to keep in sync.

## Options

```ts
virtual(modules, {
  style: 'manifest', // or 'module'
  pkg: '@pingid/vite', // excluded from dep optimisation
  types: 'src/virtual.d.ts', // false to skip generation
})
```
