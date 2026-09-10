import { SSE_ACK_EVENT, SSE_EVENT, SSE_HEADER_NAME, SSE_HOT_EVENT } from '../const.ts'

export const hot = (url: string, name: string) => async (cb: (m: any) => void) => {
  try {
    const e = await sse(url, { [SSE_HEADER_NAME]: name })
    for await (const event of e.events) {
      if (event.kind === SSE_ACK_EVENT.ACK) console.log('ack')
      if (event.kind === SSE_HOT_EVENT.HOT) {
        try {
          cb(new Function(event.code)())
        } catch (error) {
          console.error(error)
        }
      }
    }
    console.log('closed')
  } catch (error) {
    console.error(error)
  }
}

const sse = async (url: string, headers: Record<string, string>) => {
  const response = await fetch(url, { method: 'GET', headers: { Accept: 'text/event-stream', ...headers } })

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
            const data = getEvent(rawData)
            if (data) yield data
          }
        }
      }
    }
  }

  return { events: events() }
}

const getEvent = (raw: string): SSE_EVENT | undefined => {
  try {
    const data = JSON.parse(raw)
    const ev = SSE_EVENT.parse(data)
    if (ev) return ev
  } catch (error) {
    console.error(error)
  }
  return undefined
}
