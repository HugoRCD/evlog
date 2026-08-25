import type { Node } from 'oxc-parser'
import { globSync } from 'tinyglobby'
import type { ParseFn, ParseResult } from '../parse'
import { nodeLoc, parseFile, walkAst } from '../parse'
import type { FrameworkAdapter, RawRouteEntry, ScanContext } from '../types'
import { relativeFromRoot } from '../utils'

/**
 * Hono route methods → HTTP verb.
 *
 * `all` has no single verb (matches every method), so it lands as `method: null`.
 * `use` / `route` / `onError` are not entry points and are ignored.
 */
const ROUTE_METHODS: ReadonlyMap<string, string | null> = new Map([
  ['get', 'GET'],
  ['post', 'POST'],
  ['put', 'PUT'],
  ['patch', 'PATCH'],
  ['delete', 'DELETE'],
  ['options', 'OPTIONS'],
  ['all', null],
])

/**
 * Source roots to scan for `app.get('/path', …)`-style registrations.
 *
 * Hono has no file-based router: routes live in ordinary modules. Cover the
 * common layouts without walking `node_modules`.
 */
const SOURCE_GLOBS = [
  'src/**/*.{ts,tsx,js,jsx}',
  'app/**/*.{ts,tsx,js,jsx}',
  'routes/**/*.{ts,tsx,js,jsx}',
  '*.{ts,tsx,js,jsx}',
] as const

interface FoundRoute {
  method: string | null
  path: string
  line: number
}

/**
 * Pull a string path out of the first (or second, for `app.on`) call argument.
 *
 * Only string literals count: a computed path (`\`/users/${id}\``) is invisible
 * to the static scan, the same way Next skips dynamic segments it cannot name.
 */
function stringLiteral(node: Node | undefined): string | null {
  if (!node) return null
  if (node.type === 'Literal' && typeof (node as { value: unknown }).value === 'string') {
    return (node as { value: string }).value
  }
  return null
}

/**
 * Whether a string looks like a Hono route path.
 *
 * Used to tell `api.get('/users', …)` apart from `c.get('log')`: the receiver
 * name is useless (`app`, `api`, `routes`, `c`…), but a real route path starts
 * with `/` (or is the catch-all `*`), and a context key never does.
 */
function isRoutePath(path: string): boolean {
  return path.startsWith('/') || path === '*'
}

/** Function-like node types that can be Hono route handlers. */
const HANDLER_TYPES = new Set([
  'ArrowFunctionExpression',
  'FunctionExpression',
  'Identifier',
])

/**
 * Whether the node looks like a route handler (function) rather than an options
 * object. This tells `app.get('/users', handler)` apart from HTTP client calls
 * like `axios.get('/users', { headers })`.
 */
function looksLikeHandler(node: Node | undefined): boolean {
  if (!node) return false
  return HANDLER_TYPES.has(node.type)
}

/**
 * Find every `*.get('/path', handler)` / `*.post(…)` call in a parsed file.
 *
 * The receiver name does not matter (`app`, `api`, `routes`): Hono sub-apps are
 * registered the same way. Two cheap shape checks keep `c.get('log')` out:
 * the first argument must look like a path, and there must be a handler after it.
 * `app.on('GET', '/path', …)` is the one spelling where the method is an
 * argument rather than the callee.
 */
function findHonoRoutes(parsed: ParseResult): FoundRoute[] {
  const found: FoundRoute[] = []

  walkAst(parsed.program, (node) => {
    if (node.type !== 'CallExpression') return
    const call = node as { callee: Node, arguments: Node[] }
    const { callee } = call
    if (callee.type !== 'MemberExpression') return

    const { property, computed } = callee as { property: Node, computed?: boolean }
    if (computed) return
    if (property.type !== 'Identifier') return

    const { name } = property

    if (name === 'on') {
      const method = stringLiteral(call.arguments[0])?.toUpperCase() ?? null
      const path = stringLiteral(call.arguments[1])
      if (!path || !method || !isRoutePath(path) || call.arguments.length < 3) return
      const loc = nodeLoc(node, parsed.lines)
      found.push({ method, path, line: loc?.line ?? 1 })
      return
    }

    if (!ROUTE_METHODS.has(name)) return
    const path = stringLiteral(call.arguments[0])
    /* Path + handler function: `c.get('log')` has neither a `/…` path nor a
       second argument, and `axios.get('/users', { headers })` passes an object
       rather than a function, so both are filtered without tracking bindings. */
    if (!path || !isRoutePath(path) || !looksLikeHandler(call.arguments[1])) return

    const loc = nodeLoc(node, parsed.lines)
    found.push({
      method: ROUTE_METHODS.get(name) ?? null,
      path,
      line: loc?.line ?? 1,
    })
  })

  return found
}

function extractFromFile(file: string, root: string, parse: ParseFn): RawRouteEntry[] {
  const rel = relativeFromRoot(root, file)
  const parsed = parse(file)
  if (!parsed) return []

  return findHonoRoutes(parsed).map(route => ({
    framework: 'hono' as const,
    kind: 'api' as const,
    method: route.method,
    path: route.path,
    file: rel,
    handler: { line: route.line, column: 0 },
  }))
}

/**
 * Hono: scan source for `app.get/post/…('/path', …)` registrations.
 *
 * No auto-imports — `useLogger` / `c.get('log')` come from `evlog/hono`. The
 * middleware emits a per-request event once `app.use(evlog())` is registered, so
 * a bare handler is still a thin event (ambient), not a fully dark one.
 */
export const honoAdapter: FrameworkAdapter = {
  framework: 'hono',
  requestLogger: 'ambient',
  // eslint-disable-next-line require-await -- satisfies the async FrameworkAdapter contract
  async extractRoutes(ctx: ScanContext): Promise<RawRouteEntry[]> {
    const root = ctx.projectRoot
    const parse = ctx.parse ?? parseFile
    const routes: RawRouteEntry[] = []
    const seen = new Set<string>()

    for (const file of globSync([...SOURCE_GLOBS], { cwd: root, absolute: true })) {
      if (seen.has(file)) continue
      seen.add(file)
      routes.push(...extractFromFile(file, root, parse))
    }

    return routes
  },
}
