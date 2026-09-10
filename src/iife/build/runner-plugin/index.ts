import traverse from '@babel/traverse'
import { parse } from '@babel/parser'
import * as esbuild from 'esbuild'
import * as fs from 'node:fs'

import { IDENT } from '../const.ts'

export const createHotRunnerPlugin = (entry: string, inject: Injecter): esbuild.Plugin => ({
  name: 'hot-runner',
  setup: (build) => {
    build.onLoad({ filter: new RegExp(entry), namespace: 'file' }, () => hotRunnerTransform(entry, inject))
  },
})

export type Injecter = {
  ref: (imported: string, code: string) => string
  transform?: (code: string) => string
}

const hotRunnerTransform = async (
  entry: string,
  inject: Injecter,
): Promise<esbuild.OnLoadResult | null | undefined> => {
  const code = await fs.promises.readFile(entry, 'utf8')
  if (!code.includes(`${IDENT}(`)) return

  const ast = parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'] })

  const replacements: { s: number; e: number; path: string; var: string }[] = []
  let counter = 0

  // Find every dynamic import with a static string literal
  traverse(ast, {
    CallExpression(path) {
      if (path.get('callee').isIdentifier({ name: IDENT })) {
        const imp = path.node.arguments.find((x) => x.type === 'ImportExpression')
        if (!imp || imp.source.type !== 'StringLiteral') return
        const varName = `__inlined_hot_module_${counter++}`
        replacements.push({ s: imp.start!, e: imp.end!, path: imp.source.value, var: varName })
      }
    },
  })

  if (replacements.length === 0) return
  replacements.sort((a, b) => b.s - a.s)

  let transformed = code
  const staticImports: string[] = []

  for (const r of replacements) {
    staticImports.push(`import * as ${r.var} from '${r.path}';`)
    transformed = transformed.slice(0, r.s) + `Promise.resolve(${inject.ref(r.path, r.var)})` + transformed.slice(r.e)
  }

  transformed = inject.transform ? inject.transform(transformed) : transformed
  transformed = `${staticImports.join('\n')}\n${transformed}`

  return { contents: transformed, loader: loader(entry) } satisfies esbuild.OnLoadResult
}

const loader = (path: string): esbuild.Loader =>
  path.endsWith('.tsx') ? 'tsx' : path.endsWith('.ts') ? 'ts' : path.endsWith('.jsx') ? 'jsx' : 'js'
