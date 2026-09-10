import { create } from '../virtual/runtime.ts'

/** What an iife entry default-exports: set up, hand back teardown. */
export type Setup = () => (() => void) | void

/** Marks a `postMessage` from the page as a hot-reload nudge for `url`. */
export const PING = '__pingid_iife_ping'

type Mod = { default?: Setup }

/**
 * Runs the entry's setup. `mod` is inlined by the shell build, so this happens
 * during the script's initial evaluation — that timing is what lets a service
 * worker claim functional events like `fetch`, which the browser decides at
 * install time.
 */
const start = (mod: Mod) => {
  const { register, accept } = create(mod)
  register((m) => guard(() => m.default?.()))
  return accept
}

/** What a build's shell calls: setup runs once, there is nothing to swap. */
export const boot = (mod: Mod): void => void start(mod)

/**
 * What a dev shell calls. Split from {@link boot} rather than branching on a
 * parameter so the transport below — `new Function` included — is simply absent
 * from a build, instead of shipped as unreachable code esbuild can't prove dead.
 *
 * `hot` serves the entry bundled on its own.
 */
export const bootHot = (mod: Mod, hot: string): void => {
  const accept = start(mod)

  let running: Promise<void> | null = null
  let again = false

  const pull = async (): Promise<void> => {
    const res = await fetch(hot, { cache: 'no-store' })
    if (!res.ok) throw new Error(`${res.status} from ${hot}`)
    const mod_ = new Function(await res.text())() as unknown
    // `create`'s accept reads `mod` off what it is handed.
    if (mod_) accept({ mod: mod_ })
  }

  /**
   * Coalesces concurrent nudges — every open tab relays the same edit — while
   * still making a second pass when one arrives mid-flight, so the newest build
   * is never the one that got dropped.
   */
  const swap = (): void => {
    if (running) return void (again = true)
    running = pull()
      .catch((e: unknown) => console.error('[pingid:iife] hot update failed', e))
      .finally(() => {
        running = null
        if (again) ((again = false), swap())
      })
  }

  // The browser terminates an idle worker and later re-evaluates the *stored*
  // script, which is the bundle as of registration. Pulling on startup is what
  // brings a restarted worker back up to current code.
  swap()

  addEventListener('message', (event) => {
    const data = event.data as Record<string, unknown> | null | undefined
    if (data && data[PING] === hot) swap()
  })
}

/** One throwing setup shouldn't leave the script detached-but-not-attached. */
const guard = (fn: () => (() => void) | void): (() => void) | void => {
  try {
    return fn()
  } catch (e) {
    console.error('[pingid:iife] entry setup failed', e)
    return undefined
  }
}
