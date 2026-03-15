import { relative } from 'node:path'
import type { Plugin } from 'vite'
import MagicString from 'magic-string'
import { TRANSFORM_FILTER, getLineNumber, isLogMemberCall, shouldTransform, walk } from './utils'

export function createSourceLocationPlugin(enabled?: boolean): Plugin {
  let active = false
  let root = ''

  return {
    name: 'evlog:source-location',

    configResolved({ command, root: configRoot }) {
      active = enabled ?? command === 'serve'
      root = configRoot
    },

    transform: {
      filter: { ...TRANSFORM_FILTER, code: 'log.' },
      handler(code, id) {
        if (!active) return
        if (!shouldTransform(id)) return
        if (!code.includes('log.')) return

        let ast: any
        try {
          ast = (this as any).parse(code)
        } catch {
          return
        }

        const [cleanId] = id.split('?')
        const relativePath = relative(root, cleanId)
        const s = new MagicString(code)
        let modified = false

        walk(ast, (node: any) => {
          if (!isLogMemberCall(node)) return

          const [firstArg] = node.arguments
          if (node.arguments.length === 1 && firstArg.type === 'ObjectExpression') {
            const obj = firstArg

            const hasSource = obj.properties.some(
              (p: any) => p.type === 'Property' && p.key?.type === 'Identifier' && p.key.name === '__source',
            )
            if (hasSource) return

            const line = getLineNumber(code, node.start)
            const source = `${relativePath}:${line}`

            const content = code.slice(obj.start + 1, obj.end - 1).trim()
            const needsComma = content.length > 0 && !content.endsWith(',')
            const prefix = content.length > 0 ? (needsComma ? ', ' : ' ') : ' '

            s.appendLeft(obj.end - 1, `${prefix}__source: ${JSON.stringify(source)}`)
            modified = true
          }
        })

        if (!modified) return

        return { code: s.toString(), map: s.generateMap({ hires: true }) }
      },
    },
  }
}
