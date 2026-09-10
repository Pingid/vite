import { state } from './fresh-count'

/** Mounted with `fresh: true`, so `hits` is always 1 — the module is rebuilt per request. */
export default (): Response => Response.json({ hits: ++state.hits, marker: 'one' })
