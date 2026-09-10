declare module 'virtual:@pingid/vite/manifest' {
  export interface VirtualEntry {
    /** Exports the plugin narrowed the chunk to, or `null` for the whole module. */
    exports: string[] | null
    load: () => Promise<{
      key: string
      mod: any
      register: (cb: (mod: any) => (() => void) | void) => () => void
    }>
  }
  export const mods: Record<string, VirtualEntry | undefined>
}
