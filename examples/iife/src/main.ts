import url from 'iife:sw'

console.log('[page] script url', url)

navigator.serviceWorker.register(url, { updateViaCache: 'none' }).then(
  (reg) => console.log('[page] registered, scope', reg.scope),
  (e: unknown) => console.error('[page] register failed', e),
)
