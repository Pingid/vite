export const IDENT = '$hot'

export const HOT_ATTACHED = `__$hot`

export const SSE_HEADER_NAME = 'x-hot-name'

export const SSE_HOT_EVENT = {
  HOT: 'hot' as const,
  make: (target: string, code: string) => ({ kind: SSE_HOT_EVENT.HOT, code, target }),
}
export type SSE_HOT_EVENT = ReturnType<typeof SSE_HOT_EVENT.make>

export const SSE_ACK_EVENT = {
  ACK: 'ack' as const,
  make: () => ({ kind: SSE_ACK_EVENT.ACK }),
}

export type SSE_EVENT = SSE_HOT_EVENT | ReturnType<typeof SSE_ACK_EVENT.make>
const KINDS = new Set<string>([SSE_HOT_EVENT.HOT, SSE_ACK_EVENT.ACK])

export const SSE_EVENT = {
  parse: (data: unknown, key?: string): SSE_EVENT | null => {
    let d = data
    if (typeof d !== 'object' || d === null) return null
    if (key) {
      d = (d as any)[key]
      if (typeof d !== 'object' || d === null) return null
    }
    if (!KINDS.has((d as { kind: string }).kind)) return null
    return d as SSE_EVENT
  },
}
