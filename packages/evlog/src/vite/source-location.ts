import { relative } from 'node:path'
import type { Plugin } from 'vite'
import MagicString from 'magic-string'
import { getLineNumber, isLogMemberCall, shouldTransform, walk } from './utils'

export function createSourceLocationPlugin(enabled?: boolean): Plugin {
  let active = false
  let root = ''

  return {
    name: 'evlog:source-location',

    configResolved(config) {
      active = enabled ?? config.command === 'serve'
      root = config.root
    },

    transform(code, id) {
      if (!active) return
      if (!shouldTransform(id)) return
      if (!code.includes('log.')) return

      let ast: any
      try {
        ast = this.parse(code)
      } catch {
        return
      }

      const cleanId = id.split('?')[0]
      const relativePath = relative(root, cleanId)
      const s = new MagicString(code)
      let modified = false

      walk(ast, (node: any) => {
        if (!isLogMemberCall(node)) return

        const args = node.arguments
        if (args.length === 1 && args[0].type === 'ObjectExpression') {
          const obj = args[0]
          const line = getLineNumber(code, node.start)
          const source = `${relativePath}:${line}`

          const content = code.slice(obj.start + 1, obj.end - 1).trim()
          const needsComma = content.length > 0 && !content.endsWith(',')
          const prefix = content.length > 0 ? (needsComma ? ', ' : ' ') : ' '

          s.appendLeft(obj.end - 1, `${prefix}__source: '${source}'`)
          modified = true
        }
      })

      if (!modified) return

      return { code: s.toString(), map: s.generateMap({ hires: true }) }
    },
  }
}
