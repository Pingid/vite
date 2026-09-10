export type Namespace<K extends string, F extends Record<string, string> = {}> = {
  id: K
  files: F
  encoded: `\0${K}`

  match<T>(id: string, fn: (match: NameMatch<Namespace<K, F>, keyof F | Unknown>) => T): T | null
  name(id: `${K}:${string}` | `\0${K}:${string}`): string
  includes(name: string): name is `${K}:${string}` | `\0${K}:${string}`
  unknown<N extends string>(name: N): UnknownMatch<Namespace<K, F>>
} & Known<K, F>

export const namespace = <K extends string, F extends Record<string, string> = {}>(
  id: K,
  files: F = {} as F,
): Namespace<K, F> => {
  const encoded = `\0${id}`
  const ns = { id, files, encoded } as Namespace<any, any>

  ns.includes = (name): name is any => {
    if (name[0] === '\0') return name.startsWith(encoded + ':')
    return name.startsWith(id + ':')
  }

  ns.name = (id) => {
    if (id[0] === '\0') return id.slice(ns.encoded.length + 1)
    return id.slice(ns.id.length + 1)
  }

  ns.match = (id, fn) => {
    if (ns.includes(id)) return fn(makeMatch(ns, ns.name(id)))
    return null
  }

  ns.unknown = (name) => ({ kind: 'unknown', name, id: `${id}:${name}`, encoded: `\0${id}:${name}` })

  Object.entries(files).forEach(([fllabel, flId]) => {
    ns[fllabel] = { id: `${id}:${flId}`, encoded: `\0$${id}:${flId}` } as any
  })

  return ns as any
}

const makeMatch = (ns: Namespace<any, any>, name: string): KnownMatch<any, any> | UnknownMatch<any> => {
  const id = `${ns.id}:${name}`
  const base = { name, id, encoded: `\0${id}` }
  const matched = [...Object.entries(ns.files)].find(([, flId]) => flId === name)
  if (matched) return { ...base, kind: matched[0] } as any
  return { ...base, kind: 'unknown' } as any
}

type Known<K extends string, F extends Record<string, string>> = {
  [N in keyof F]: { id: `${K}:${N & string}`; encoded: `\0${K}:${N & string}` }
}
// type Named<K extends string, N extends string> =

type Unknown = string & { __brand: 'unknown' }

// type IdMatch<N extends Namespace<any, any>, F extends keyof N['files'] | Unknown = keyof N['files'] | Unknown> = F extends Unknown
type NameMatch<
  N extends Namespace<any, any>,
  F extends keyof N['files'] | Unknown = keyof N['files'] | Unknown,
> = F extends Unknown ? UnknownMatch<N> : KnownMatch<N, F>

interface KnownMatch<N extends Namespace<any, any>, F extends keyof N['files']> {
  kind: F
  name: F
  id: `${N['id']}:${N['files'][F]}`
  encoded: `\0${N['id']}:${N['files'][F]}`
}

interface UnknownMatch<N extends Namespace<any, any>> {
  kind: 'unknown'
  name: string
  id: `${N['id']}:${string}`
  encoded: `\0${N['id']}:${string}`
}
