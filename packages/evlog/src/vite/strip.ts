import type { Plugin } from 'vite'
import type { LogLevel } from '../types'
import MagicString from 'magic-string'
import { isLogMemberCall, shouldTransform, walk } from './utils'

export function createStripPlugin(levels: LogLevel[]): Plugin {
  if (levels.length === 0) return { name: 'evlog:strip' }

  let isBuild = false

  return {
    name: 'evlog:strip',

    configResolved(config) {
      isBuild = config.command === 'build'
    },

    transform(code, id) {
      if (!isBuild) return
      if (!shouldTransform(id)) return
      if (!levels.some(l => code.includes(`log.${l}`))) return

      let ast: any
      try {
        ast = this.parse(code)
      } catch {
        return
      }

      const s = new MagicString(code)
      let modified = false

      walk(ast, (node: any, parent: any) => {
        if (!isLogMemberCall(node, levels)) return

        if (parent?.type === 'ExpressionStatement') {
          s.remove(parent.start, parent.end)
        } else {
          s.overwrite(node.start, node.end, 'void 0')
        }
        modified = true
      })

      if (!modified) return

      return { code: s.toString(), map: s.generateMap({ hires: true }) }
    },
  }
}
