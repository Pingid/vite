/// <reference lib="webworker" />

export { $hot } from '../iife/client.ts'

declare const self: ServiceWorkerGlobalScope

type Events = ServiceWorkerGlobalScopeEventMap
type Type = keyof Events

type Listener<K extends Type> = (event: Events[K]) => void
type StoredListener = (event: Event) => void

type Cleanup = () => void
type Setup = (cx: Cx) => void | Cleanup | Promise<void | Cleanup>

interface Entry {
  listener: StoredListener
  once: boolean
  off: () => void
}

export interface ListenOptions {
  /** Detach automatically after the first event. */
  once?: boolean
  /** Detach when the signal aborts. */
  signal?: AbortSignal
}

export interface Cx {
  /**
   * Reserve a global handler for `types` before any listener exists. Needed for
   * functional events — the browser decides at install time whether the worker
   * handles `fetch`, based on the listeners registered during evaluation.
   */
  watch(...types: Type[]): void

  addEventListener<K extends Type>(type: K, listener: Listener<K>, options?: ListenOptions): void

  removeEventListener<K extends Type>(type: K, listener: Listener<K>): void

  on<K extends Type>(type: K, listener: Listener<K>, options?: ListenOptions): () => void

  /**
   * Resolves once this worker has activated. Rejects if it goes redundant.
   * Do not await this inside an `activate` handler's `waitUntil` — activation
   * cannot complete until that promise settles, so it would deadlock. Use
   * {@link Cx.claim} there instead.
   */
  ready(skipWaiting?: boolean): Promise<void>

  /** self.clients.claim() — safe to call from an `activate` handler. */
  claim(skipWaiting?: boolean): Promise<void>

  /** Propogate hot updates to the service worker */
  worker: ServiceWorkerGlobalScope
}

export interface Runner {
  readonly started: boolean
  start(): void
  stop(): void
  /** Resolves once an async `setup` has settled and its cleanup has run. */
  dispose(): Promise<void>
}

/** @deprecated Renamed to {@link Runner}; `Worker` collides with the global `Worker`. */
export type Worker = Runner

/**
 * `setup` runs synchronously, but nothing is bound to the global until
 * `start()`. Call `start()` during the worker's initial evaluation, otherwise
 * `install` and `fetch` may be missed.
 */
export const service = (setup: Setup): Runner => {
  const watched = new Set<Type>()
  const listeners = new Map<Type, Map<StoredListener, Entry>>()
  const attached = new Map<Type, EventListener>()

  let started = false
  let disposed = false
  let cleanup: Cleanup | undefined

  const attach = (type: Type): void => {
    if (attached.has(type)) return

    const handler: EventListener = (event) => {
      const current = listeners.get(type)

      if (!current) return

      // Copy so listeners can detach themselves while dispatching.
      for (const entry of [...current.values()]) {
        if (entry.once) entry.off()

        try {
          entry.listener(event)
        } catch (error) {
          // One bad listener shouldn't stop the rest of the chain.
          report(error)
        }
      }
    }

    self.addEventListener(type, handler)

    attached.set(type, handler)
  }

  const detach = (type: Type): void => {
    const handler = attached.get(type)

    if (!handler) return

    self.removeEventListener(type, handler)
    attached.delete(type)
  }

  const watch: Cx['watch'] = (...types) => {
    if (disposed) return

    for (const type of types) {
      watched.add(type)
      if (started) attach(type)
    }
  }

  const add = <K extends Type>(type: K, listener: Listener<K>, options?: ListenOptions): void => {
    if (disposed || options?.signal?.aborted) return

    const stored = listener as StoredListener
    const bucket = getOr(listeners, type, () => new Map<StoredListener, Entry>())

    // Same semantics as EventTarget: re-adding the same listener is a no-op.
    if (bucket.has(stored)) return

    const off = (): void => {
      options?.signal?.removeEventListener('abort', off)
      remove(type, listener)
    }

    bucket.set(stored, { listener: stored, once: options?.once ?? false, off })

    options?.signal?.addEventListener('abort', off, { once: true })

    if (started) attach(type)
  }

  const remove = <K extends Type>(type: K, listener: Listener<K>): void => {
    const bucket = listeners.get(type)

    if (!bucket) return

    bucket.delete(listener as StoredListener)

    if (bucket.size) return

    listeners.delete(type)

    // Keep the global handler only while something still needs it.
    if (!watched.has(type)) detach(type)
  }

  const cx: Cx = {
    watch,
    addEventListener: add,
    removeEventListener: remove,

    on(type, listener, options) {
      add(type, listener, options)
      return () => remove(type, listener)
    },

    async ready(skipWaiting = false) {
      if (skipWaiting) await self.skipWaiting()
      await state('activated')
    },

    async claim(skipWaiting = false) {
      if (skipWaiting) await self.skipWaiting()

      // `activating` is enough: the worker is already the registration's active
      // worker by the time the activate event fires, which is where claim()
      // normally runs.
      await state('activating', 'activated')
      await self.clients.claim()
    },

    worker: self,
  }

  const result = setup(cx)

  if (typeof result === 'function') cleanup = result

  const settled =
    typeof result === 'object' && result !== null
      ? result
          .then((value) => {
            if (typeof value === 'function') cleanup = value
          })
          .catch(report)
      : undefined

  const runner: Runner = {
    get started() {
      return started
    },

    start() {
      if (started || disposed) return

      started = true

      for (const type of watched) attach(type)
      for (const type of listeners.keys()) attach(type)
    },

    stop() {
      if (!started) return

      started = false

      for (const type of [...attached.keys()]) detach(type)
    },

    async dispose() {
      if (disposed) return

      disposed = true

      runner.stop()
      watched.clear()
      listeners.clear()

      // An async setup may still be about to hand back its cleanup.
      await settled

      const run = cleanup
      cleanup = undefined
      run?.()
    },
  }

  return runner
}

/** Resolves when this worker reaches one of `accept`; rejects if it goes redundant. */
const state = (...accept: readonly ServiceWorkerState[]): Promise<void> => {
  const worker = self.serviceWorker

  if (accept.includes(worker.state)) return Promise.resolve()
  if (worker.state === 'redundant') return Promise.reject(redundant())

  return new Promise<void>((resolve, reject) => {
    const scope = new AbortController()

    worker.addEventListener(
      'statechange',
      () => {
        if (accept.includes(worker.state)) {
          scope.abort()
          resolve()
        } else if (worker.state === 'redundant') {
          scope.abort()
          reject(redundant())
        }
      },
      { signal: scope.signal },
    )
  })
}

const redundant = (): Error => new Error('Service worker became redundant.')

const report = (error: unknown): void => {
  // Surfaces on the global error handler instead of vanishing.
  queueMicrotask(() => {
    throw error
  })
}

export const getOr = <T, K = PropertyKey>(obj: Map<K, T>, key: K, defaultValue: () => T): T => {
  if (obj.has(key)) return obj.get(key)!
  const newValue = defaultValue()
  obj.set(key, newValue)
  return newValue
}
