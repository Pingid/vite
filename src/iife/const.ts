export const SW_UPDATE = {
  type: 'sw-update',
  make: (p: { code: string; entrypoint: string }): HotUpdate => ({
    type: SW_UPDATE.type,
    code: p.code,
    entrypoint: p.entrypoint,
  }),
} as const

export type HotUpdate = { type: typeof SW_UPDATE.type; code: string; entrypoint: string }
