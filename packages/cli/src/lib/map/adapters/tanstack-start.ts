import { basename } from 'node:path'
import type { Node } from 'oxc-parser'
import { globSync } from 'tinyglobby'
import type { ParseResult } from '../parse'
import { findHandlerLocation, nodeLoc, parseFile, walkAst } from '../parse'
import type { FrameworkAdapter, RawRouteEntry, ScanContext } from '../types'
import { relativeFromRoot, segmentsToPath, stripExtension } from '../utils'

function extractTanstackRoutes(file: string, root: string): RawRouteEntry[] {
  const rel = relativeFromRoot(root, file)
  if (rel.includes('__root')) return []

  const segments = stripExtension(rel.replace(/^src\/routes\//, '')).split('/')
  const path = segmentsToPath(segments) || '/'
  const parsed = parseFile(file)
  const routes: RawRouteEntry[] = []

  if (!parsed) {
    routes.push({
      framework: 'tanstack-start',
      kind: 'page',
      method: null,
      path,
      file: rel,
      handler: null,
    })
    return routes
  }

  const hasServerHandlers = detectServerHandlers(parsed)
  if (hasServerHandlers.length > 0) {
    for (const { method, line } of hasServerHandlers) {
      routes.push({
        framework: 'tanstack-start',
        kind: 'api',
        method,
        path,
        file: rel,
        handler: { line, column: 0 },
      })
    }
  } else if (path.startsWith('/api/') || basename(file).includes('api')) {
    routes.push({
      framework: 'tanstack-start',
      kind: 'api',
      method: null,
      path,
      file: rel,
      handler: findHandlerLocation(parsed, ['createServerFn']),
    })
  } else {
    routes.push({
      framework: 'tanstack-start',
      kind: 'page',
      method: null,
      path,
      file: rel,
      handler: null,
    })
  }

  return routes
}

function detectServerHandlers(parsed: ParseResult): Array<{ method: string, line: number }> {
  const handlers: Array<{ method: string, line: number }> = []
  walkAst(parsed.program, (node) => {
    if (node.type !== 'Property') return
    const prop = node as { key: { type: string, name?: string }, value: { type: string } }
    if (prop.key.type === 'Identifier') {
      const key = prop.key.name?.toUpperCase()
      if (key && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(key)) {
        if (prop.value.type === 'ArrowFunctionExpression' || prop.value.type === 'FunctionExpression') {
          const loc = nodeLoc(prop.value as Node, parsed.lines)
          handlers.push({ method: key, line: loc?.line ?? 1 })
        }
      }
    }
  })
  return handlers
}

/**
 * TanStack Start: `src/routes/**` file-based routes, API vs page via HTTP method
 * props / `createServerFn`. No auto-imports — evlog helpers must be imported.
 */
export const tanstackStartAdapter: FrameworkAdapter = {
  framework: 'tanstack-start',
  requestLogger: 'explicit',
  // eslint-disable-next-line require-await -- satisfies the async FrameworkAdapter contract
  async extractRoutes(ctx: ScanContext): Promise<RawRouteEntry[]> {
    const routes: RawRouteEntry[] = []
    const root = ctx.projectRoot

    for (const file of globSync('src/routes/**/*.{ts,tsx}', { cwd: root, absolute: true })) {
      routes.push(...extractTanstackRoutes(file, root))
    }

    return routes
  },
}
