import { type Plugin, type UserConfig } from 'vite'
import { Lock, openLock } from '@lickle/lock'
import path from 'path'
import fs from 'fs'

export const virtual = (modules: Record<string, string>, _p?: { types?: string }): Plugin => {
  const dir = import.meta.dirname

  const mods = Object.entries(modules).map(([key, value]) => {
    const file = path.resolve(value)
    const id = path.resolve(dir, `virtual:${key}`)
    return { key, file, id, resolved: '\0' + id }
  })

  const types_file = path.resolve(dir, `./types.d.ts`)
  const clearing = (async () => {
    await using guard = await openLock(types_file, Lock.Exclusive)
    await guard.handle.truncate(0)
  })()

  let isDev = false

  return {
    name: 'pingid:virtual',
    config: (c, env) => {
      if (env.mode === 'development') isDev = true
      if (isDev) return c
      const fls = Object.fromEntries(mods.map((m) => [m.key, `./${path.relative(c.root ?? process.cwd(), m.file)}`]))
      const conf: UserConfig = {
        ...c,
        define: { ...c.define, 'import.meta.env.VITE_VIRTUAL': JSON.stringify(fls) },
        resolve: {
          ...c.resolve,
          alias: { '@pingid/vite/virtual': path.resolve(dir, `./client-build.js`) },
        },
        build: {
          ...c.build,
          rolldownOptions: {
            ...c.build?.['rolldownOptions'],
            input: mergeInput(
              c?.build?.['rolldownOptions']?.input,
              Object.fromEntries(mods.map((m) => [`virtual_${m.key}`, m.file])),
            ),
            output: {
              preserveModules: true,
            },
          },
        },
      }

      return conf
    },

    configResolved: async (c) => {
      await clearing
      await fs.promises.appendFile(types_file, `${typeDecls(mods)}\n\n`)
    },
    resolveId: (id) => {
      console.log('resolveId', id)
      if (!isDev) {
        const mod = mods.find((m) => id.includes(m.file))
        return mod?.file ?? id
      }
      const mod = mods.find((m) => id.includes(m.id))
      if (!mod) return null
      const qry = id.split('?')[1]
      return `${mod.resolved}${qry ? `?${qry}` : ''}`
    },
    load: (id) => {
      const mod = mods.find((m) => (isDev ? id.includes(m.id) : id.includes(m.file)))
      if (!mod) return null
      const qry = new URLSearchParams(id.split('?')[1])
      const exp = qry.get('exports')?.split(',')

      const w = writer()

      if (!exp || exp.length === 0) w.ln(`import * as mod from '${mod.file}'`, `export * as mod from '${mod.file}'`)
      else w.ln(`import { ${exp.join(', ')} } from '${mod.file}'`, `export const mod = { ${exp.join(', ')} }`)
      w.ln(`export const register = (${runner.toString()})(mod)`)
      return w.toString()
    },
  }
}

type Cb = (mod: Md) => () => void
type Md = { mod: any; register: (cb: Cb) => () => void; run: () => void }

const runner = (mod: Md) => {
  let reg = new Map<Cb, () => void>()

  const register = (cb: Cb) => {
    const cb_ = (mod: Md) => cb(mod)
    reg.set(cb_, cb_(mod))
    return () => (reg.get(cb_)?.(), reg.delete(cb_))
  }

  if (import.meta.hot) {
    import.meta.hot.accept((_md: any) => {
      const md = _md as Md | undefined
      if (!md?.mod) return
      const dis = [...reg.entries()]
      reg.clear()
      for (const [cb, d] of dis) (d(), md.register(cb))
    })
  }

  return register
}

const typeDecls = (mods: { key: string; file: string }[]) => {
  const w = writer()
  w.ln("declare module '@pingid/vite/types'")
  w.block(() => {
    w.ln('export interface VirtualModule')
    w.block(() => mods.forEach((p) => w.ln(`${p.key}: typeof import('${p.file}');`)))
  })
  return w.toString()
}

const writer = () => {
  const lns: string[] = []
  let indent = 0
  return {
    ln: (...ln: string[]) => ln.forEach((l) => lns.push(' '.repeat(indent) + l)),
    block: (cb: () => void) => {
      lns[lns.length - 1] += ' {'
      indent += 2
      cb()
      indent -= 2
      lns.push(' '.repeat(indent) + '}')
    },
    toString: () => lns.join('\n'),
  }
}

const mergeInput = (existingInput?: any, dynamicInputs?: Record<string, string>) => {
  let mergedInput: Record<string, string> | undefined = undefined
  if (!existingInput) {
    // Fallback if user didn't define any inputs
    mergedInput = dynamicInputs
  } else if (typeof existingInput === 'string') {
    // If user defined a single string entry
    mergedInput = { main: existingInput, ...dynamicInputs }
  } else if (Array.isArray(existingInput)) {
    // If user defined an array of entries, convert to rollup object format
    mergedInput = {
      ...Object.fromEntries(existingInput.map((item, index) => [`entry_${index}`, item])),
      ...dynamicInputs,
    }
  } else {
    // If user defined an object map of entries
    mergedInput = { ...existingInput, ...dynamicInputs }
  }
  return mergedInput
}
