const JS_RE = /\.[cm]?[jt]sx?$/

/**
 * Rolldown-native file filter for transform hooks.
 * Runs on the Rust side in Vite 8+, skipping JS bridge for non-matching files.
 * `moduleType` is a Rolldown-only feature (ignored by Vite 7), more precise than id regex.
 * Older Vite versions ignore both filters and fall through to `shouldTransform()`.
 */
export const TRANSFORM_FILTER = {
  id: /\.[cm]?[jt]sx?$|\.vue\?|\.svelte\?/,
  moduleType: ['js', 'jsx', 'ts', 'tsx'],
}

export function shouldTransform(id: string): boolean {
  if (id.includes('node_modules')) return false
  if (id.startsWith('\0')) return false
  const [cleanId] = id.split('?')
  if (JS_RE.test(cleanId)) return true
  if ((cleanId.endsWith('.vue') || cleanId.endsWith('.svelte')) && id.includes('?')) return true
  return false
}

export function walk(
  node: any,
  enter: (node: any, parent: any) => void,
  parent?: any,
): void {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return
  enter(node, parent)

  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue
    const value = node[key]
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && typeof child.type === 'string') {
          walk(child, enter, node)
        }
      }
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      walk(value, enter, node)
    }
  }
}

export function isLogMemberCall(node: any, levels?: string[]): boolean {
  return (
    node.type === 'CallExpression'
    && node.callee?.type === 'MemberExpression'
    && node.callee.object?.type === 'Identifier'
    && node.callee.object.name === 'log'
    && node.callee.property?.type === 'Identifier'
    && (!levels || levels.includes(node.callee.property.name))
  )
}

export function getLineNumber(code: string, pos: number): number {
  let line = 1
  for (let i = 0; i < pos; i++) {
    if (code[i] === '\n') line++
  }
  return line
}
