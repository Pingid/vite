import { SSE_ACK_EVENT, SSE_EVENT, SSE_HEADER_NAME, SSE_HOT_EVENT } from '../const.ts'

const listen = (listen: (cb: (m: unknown) => void) => void) => (target: string) => (cb: (m: unknown) => void) =>
  listen((m) => {
    let ev = SSE_EVENT.parse(m) ?? SSE_EVENT.parse(m, 'data')
    if (!ev) return
    if (ev.kind === SSE_ACK_EVENT.ACK) console.log('ack')
    if (ev.kind === SSE_HOT_EVENT.HOT && ev.target === target) {
      try {
        cb(new Function(ev.code)())
      } catch (error) {
        console.error(error)
      }
    }
  })

export const hot = (name: string) => listen(hotEvents(name))

export const sse = (url: string) => (target: string) => {
  return listen((cb) => {
    let stopped = false
    let dispose = () => {}
    ;(async () => {
      const { events, cancel } = await sseEvents(url, target)
      if (stopped) return cancel()
      dispose = cancel
      for await (const event of events) {
        if (stopped) break
        cb(event)
      }
    })()
    return () => {
      stopped = true
      dispose()
    }
  })(target)
}

const hotEvents = (name: string) => {
  if (typeof import.meta.hot === 'undefined') return (_cb: (d: unknown) => void) => () => {}
  const listeners: Set<(d: unknown) => void> = new Set()
  import.meta.hot.on(name, (d) => {
    for (const listener of listeners) listener(d)
  })

  return (cb: (d: unknown) => void) => {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }
}

const sseEvents = async (url: string, target: string) => {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'text/event-stream', [SSE_HEADER_NAME]: target },
  })

  if (!response.ok || !response.body) {
    throw new Error(`Failed to connect: ${response.statusText}`)
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()

  const events = async function* () {
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += value

      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        const lines = part.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const rawData = line.slice(6)
            try {
              yield JSON.parse(rawData)
            } catch (error) {
              console.error(error)
            }
          }
        }
      }
    }
  }
  return { events: events(), cancel: () => reader.cancel() }
}
