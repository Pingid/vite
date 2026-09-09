import { emitter } from '../_util/shared.ts'
import { propogateHotUpdates } from '../iife/client.ts'

export type RegistrationEventMap = {
  statechange: ServiceWorkerState
  updatefound: ServiceWorker
  installing: ServiceWorker
  waiting: ServiceWorker
  active: ServiceWorker
  redundant: ServiceWorker
  error: unknown
}

export interface ReadyOptions {
  signal?: AbortSignal
}

/**
 * Thin wrapper around a `ServiceWorkerRegistration` that tracks the newest
 * worker attached to it and exposes its lifecycle as events.
 */
export class Sw {
  private readonly _emitter = emitter<RegistrationEventMap>()
  private readonly _registration: Promise<ServiceWorkerRegistration>
  private readonly _lifetime = new AbortController()

  /** Aborted whenever the tracked worker is replaced, so listeners don't pile up. */
  private _watched?: AbortController
  private _state?: ServiceWorkerState
  private _disposed = false
  private _scriptURL?: string
  private _options?: RegistrationOptions

  public registration?: ServiceWorkerRegistration
  public worker?: ServiceWorker

  static get supported(): boolean {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
  }

  static register(scriptURL: string | URL, options?: RegistrationOptions): Sw {
    const sw = new Sw(container().register(scriptURL, options))
    sw._scriptURL = scriptURL.toString()
    sw._options = options
    return sw
  }

  static async reregister(scriptURL: string | URL, options?: RegistrationOptions): Promise<Sw> {
    const existing = await find(scriptURL, options?.scope)
    if (existing) await existing.unregister()
    return Sw.register(scriptURL, options)
  }

  static async for(scriptURL: string | URL, options?: RegistrationOptions): Promise<Sw> {
    const existing = await find(scriptURL, options?.scope)
    const sw = existing ? new Sw(existing) : Sw.register(scriptURL, options)
    sw._scriptURL = scriptURL.toString()
    sw._options = options
    return sw
  }

  static async registrations(): Promise<readonly Sw[]> {
    const all = await container().getRegistrations()
    return all.map((registration) => new Sw(registration))
  }

  constructor(registration: Promise<ServiceWorkerRegistration> | ServiceWorkerRegistration) {
    this._registration = Promise.resolve(registration)
    void this.observe()

    // Propogate hot updates to the service worker
    propogateHotUpdates({
      send: (data) => {
        if (this.state() !== 'activated') return console.warn(`no yet active`)
        this.registration?.active?.postMessage(data)
      },
    })
  }

  on<K extends keyof RegistrationEventMap>(type: K, listener: (event: RegistrationEventMap[K]) => void): () => void {
    return this._emitter.on(type, listener)
  }

  async unregister(): Promise<boolean> {
    return (await this.resolve()).unregister()
  }

  async reregister(url?: string | URL, options?: RegistrationOptions): Promise<Sw> {
    const current = await this.resolve()
    const _url = url ?? this._scriptURL ?? current.scope
    const _options = options ?? this._options ?? { scope: current.scope, updateViaCache: current.updateViaCache }
    await current.unregister()
    return Sw.register(_url, _options)
  }

  async update(): Promise<ServiceWorkerRegistration> {
    const registration = await this.resolve()
    await registration.update()
    return registration
  }

  /**
   * Resolves once the registration has an activated worker. Rejects if the
   * worker it is waiting on goes redundant (i.e. install or activate failed).
   */
  async ready(options: ReadyOptions = {}): Promise<ServiceWorker> {
    const { signal } = options

    if (signal?.aborted) throw signal.reason

    const registration = await this.resolve()
    const worker = registration.active ?? registration.waiting ?? registration.installing

    if (!worker) throw new Error('Registration has no service worker.')
    if (worker.state === 'activated') return worker
    if (worker.state === 'redundant') throw redundant(worker)

    return new Promise<ServiceWorker>((resolve, reject) => {
      const scope = new AbortController()

      const settle = <T>(complete: (value: T) => void, value: T): void => {
        scope.abort()
        complete(value)
      }

      signal?.addEventListener('abort', () => settle(reject, signal.reason), { signal: scope.signal })

      worker.addEventListener(
        'statechange',
        () => {
          if (worker.state === 'activated') settle(resolve, worker)
          else if (worker.state === 'redundant') settle(reject, redundant(worker))
        },
        { signal: scope.signal },
      )
    })
  }

  /** State of the tracked worker, or `undefined` before the registration resolves. */
  state(): ServiceWorkerState | undefined {
    return this._state
  }

  /** Detaches every listener. The instance is inert afterwards. */
  dispose(): void {
    if (this._disposed) return

    this._disposed = true
    this._lifetime.abort()
    this._watched?.abort()
    this._emitter.clear()
  }

  private async observe(): Promise<void> {
    try {
      const registration = await this.resolve()

      if (this._disposed) return

      this.watch(registration.installing ?? registration.waiting ?? registration.active)

      registration.addEventListener(
        'updatefound',
        () => {
          const worker = registration.installing

          if (!worker) return

          this._emitter.emit('updatefound', worker)
          this.watch(worker)
        },
        { signal: this._lifetime.signal },
      )
    } catch (error) {
      this._emitter.emit('error', error)
    }
  }

  private watch(worker: ServiceWorker | null): void {
    if (!worker || worker === this.worker || this._disposed) return

    // Stop listening to the worker this one supersedes.
    this._watched?.abort()

    const scope = new AbortController()

    this._watched = scope
    this.worker = worker

    worker.addEventListener('statechange', () => this.sync(worker), { signal: scope.signal })

    this.sync(worker)
  }

  private sync(worker: ServiceWorker): void {
    // Ignore stale workers after a newer update starts.
    if (worker !== this.worker || worker.state === this._state) return

    this._state = worker.state
    this._emitter.emit('statechange', worker.state)

    switch (worker.state) {
      case 'installing':
        this._emitter.emit('installing', worker)
        break
      case 'installed':
        this._emitter.emit('waiting', worker)
        break
      case 'activated':
        this._emitter.emit('active', worker)
        break
      case 'redundant':
        this._emitter.emit('redundant', worker)
        break
    }
  }

  private async resolve(): Promise<ServiceWorkerRegistration> {
    const registration = await this._registration
    this.registration = registration
    return registration
  }
}

const container = (): ServiceWorkerContainer => {
  if (!Sw.supported) {
    throw new Error('Service workers are unavailable here (they need a secure context and browser support).')
  }

  return navigator.serviceWorker
}

const base = (): string => (typeof document !== 'undefined' ? document.baseURI : location.href)

const absolute = (url: string | URL): string => new URL(url, base()).href

const scriptOf = (registration: ServiceWorkerRegistration): string | undefined =>
  (registration.installing ?? registration.waiting ?? registration.active)?.scriptURL

const find = async (scriptURL: string | URL, scope?: string): Promise<ServiceWorkerRegistration | undefined> => {
  const script = absolute(scriptURL)
  const within = scope === undefined ? undefined : absolute(scope)
  const all = await container().getRegistrations()

  return all.find((r) => scriptOf(r) === script && (within === undefined || r.scope === within))
}

const redundant = (worker: ServiceWorker): Error =>
  new Error(`Service worker at ${worker.scriptURL} became redundant before activating.`)
