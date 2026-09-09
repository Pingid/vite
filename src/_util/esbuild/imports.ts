import traverse from '@babel/traverse'
import { parse } from '@babel/parser'
import * as esbuild from 'esbuild'
import fs from 'node:fs/promises'

export const inlineImports = (p?: { onImport?: (importPath: string) => void }) =>
  ({
    name: 'inline-all-dynamic-imports',
    setup(build) {
      // Intercept JS/TS files
      build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
        if (args.path.includes('node_modules')) return

        const code = await fs.readFile(args.path, 'utf8')

        // Quick-bail check before running the parser
        if (!code.includes('import(')) return

        let ast
        try {
          ast = parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
        } catch {
          return // Fallback to let esbuild report actual parse errors
        }

        const replacements: { start: number; end: number; importPath: string; varName: string }[] = []
        let counter = 0

        // Find every dynamic import with a static string literal
        traverse(ast, {
          CallExpression(path) {
            if (path.node.callee.type === 'Import' && path.node.arguments.length > 0) {
              const firstArg = path.node.arguments[0]!

              let importPath = null
              if (firstArg.type === 'StringLiteral') {
                importPath = firstArg.value
              } else if (firstArg.type === 'TemplateLiteral' && firstArg.expressions.length === 0) {
                importPath = firstArg.quasis[0]!.value.raw
              }

              if (importPath) {
                const varName = `__inlined_dynamic_import_${counter++}`
                replacements.push({
                  start: path.node.start!,
                  end: path.node.end!,
                  importPath,
                  varName,
                })
                p?.onImport?.(importPath)
              }
            }
          },
        })

        if (replacements.length === 0) return

        // Sort replacements in reverse order so slicing offsets don't drift
        replacements.sort((a, b) => b.start - a.start)

        let transformed = code
        const staticImports = []

        for (const { start, end, importPath, varName } of replacements) {
          staticImports.push(`import * as ${varName} from '${importPath}';`)
          transformed = transformed.slice(0, start) + `Promise.resolve(${varName})` + transformed.slice(end)
        }

        // Prepend all converted static imports to the top of the file
        transformed = `${staticImports.join('\n')}\n${transformed}`

        // Pick loader based on file extension
        const loader = args.path.endsWith('.tsx')
          ? 'tsx'
          : args.path.endsWith('.ts')
            ? 'ts'
            : args.path.endsWith('.jsx')
              ? 'jsx'
              : 'js'

        return {
          contents: transformed,
          loader,
        }
      })
    },
  }) satisfies esbuild.Plugin
