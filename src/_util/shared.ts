export const getOr = <T, K = PropertyKey>(obj: Map<K, T>, key: K, defaultValue: () => T): T => {
  if (obj.has(key)) return obj.get(key)!
  const newValue = defaultValue()
  obj.set(key, newValue)
  return newValue
}

export const emitter = <T extends Record<string, unknown>>() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listeners = new Map<keyof T, Set<(event: any) => void>>()

  return {
    on<K extends keyof T>(type: K, listener: (event: T[K]) => void): () => void {
      const set = listeners.get(type) ?? new Set()

      listeners.set(type, set)
      set.add(listener)

      let attached = true

      return () => {
        if (!attached) return

        attached = false
        set.delete(listener)

        // Only drop the bucket if it is still the one we added to.
        if (set.size === 0 && listeners.get(type) === set) listeners.delete(type)
      }
    },

    emit<K extends keyof T>(type: K, event: T[K]): void {
      // Copy so listeners can safely detach while emitting.
      for (const listener of [...(listeners.get(type) ?? [])]) {
        try {
          listener(event)
        } catch (error) {
          // Surface the failure without stopping the remaining listeners.
          queueMicrotask(() => {
            throw error
          })
        }
      }
    },

    clear(): void {
      listeners.clear()
    },
  }
}
