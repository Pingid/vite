# iife example

A service worker that hot-reloads in dev.

```bash
pnpm install   # links @pingid/vite from the repo root
pnpm dev
```

Open the console, then edit `src/sw.ts` or `src/mark.ts`. The worker logs its teardown and the new
setup, and the page never reloads. `pnpm build` emits the worker to `dist/sw.js`.
