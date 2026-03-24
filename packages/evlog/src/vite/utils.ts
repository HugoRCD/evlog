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
  enter: (node: any, parent: any, grandparent: any) => void,
  parent?: any,
  grandparent?: any,
): void {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return
  enter(node, parent, grandparent)

  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue
    const value = node[key]
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && typeof child.type === 'string') {
          walk(child, enter, node, parent)
        }
      }
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      walk(value, enter, node, parent)
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

export function buildLineIndex(code: string): (pos: number) => number {
  const offsets = [0]
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '\n') offsets.push(i + 1)
  }
  return (pos: number) => {
    let lo = 0
    let hi = offsets.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (offsets[mid] <= pos) lo = mid + 1
      else hi = mid
    }
    return lo
  }
}
