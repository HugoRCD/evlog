import { basename } from 'node:path'
import { globSync } from 'tinyglobby'
import type { ParseFn } from '../parse'
import { findHandlerLocation, parseFile } from '../parse'
import type { FrameworkAdapter, RawRouteEntry, ScanContext } from '../types'
import { extractMethodFromFilename, relativeFromRoot, segmentsToPath, stripRouteFilename } from '../utils'

/**
 * Extensions Nitro serves a handler from.
 *
 * `.mjs` and `.cjs` are in the list because Nitro runs them exactly like a
 * `.ts` handler: a route written in either was invisible to the whole scan.
 */
const HANDLER_EXT = '{ts,js,mts,cts,mjs,cjs}'

/** A directory of file-based handlers, and the URL prefix its routes get. */
interface RouteRoot {
  dir: string
  prefix: string
}

/**
 * Where each framework keeps its handlers.
 *
 * Nuxt and raw Nitro differ by these paths and nothing else, so they share the
 * extraction below rather than each carrying a copy of it — the copies had
 * already started to drift.
 */
const API_ROOTS: Record<'nuxt' | 'nitro', readonly RouteRoot[]> = {
  nuxt: [{ dir: 'server/api', prefix: '/api' }, { dir: 'server/routes', prefix: '' }],
  nitro: [{ dir: 'api', prefix: '/api' }, { dir: 'routes', prefix: '' }],
}

const MIDDLEWARE_DIR: Record<'nuxt' | 'nitro', string> = {
  nuxt: 'server/middleware',
  nitro: 'middleware',
}

const PAGE_GLOBS = ['pages/**/*.vue']
const CRON_GLOBS = [`server/tasks/**/*.${HANDLER_EXT}`]

/** What both Nitro-based adapters need to turn a file into an entry point. */
interface ExtractContext {
  root: string
  parse: ParseFn
  framework: 'nuxt' | 'nitro'
}

function fileToApiRoute(file: string, apiRoot: RouteRoot, { root, parse, framework }: ExtractContext): RawRouteEntry {
  const rel = relativeFromRoot(root, file)
  const method = extractMethodFromFilename(basename(file))

  const parts = rel.slice(`${apiRoot.dir}/`.length).split('/')
  parts[parts.length - 1] = stripRouteFilename(parts.at(-1) ?? '')

  const parsed = parse(file)

  return {
    framework,
    kind: 'api',
    method,
    path: segmentsToPath(parts, apiRoot.prefix) || '/',
    file: rel,
    handler: parsed ? findHandlerLocation(parsed, ['defineEventHandler', 'eventHandler']) : null,
  }
}

function fileToPageRoute(file: string, root: string): RawRouteEntry {
  const rel = relativeFromRoot(root, file)
  const segments = rel.slice('pages/'.length).split('/')
  const last = segments.length - 1
  segments[last] = stripRouteFilename(segments[last] ?? '')
  const path = segmentsToPath(segments) || '/'

  return {
    framework: 'nuxt',
    kind: 'page',
    method: null,
    path,
    file: rel,
    handler: null,
  }
}

function fileToMiddlewareRoute(file: string, { root, parse, framework }: ExtractContext): RawRouteEntry {
  const rel = relativeFromRoot(root, file)
  const parsed = parse(file)
  const handler = parsed
    ? findHandlerLocation(parsed, ['defineEventHandler'])
    : null

  return {
    framework,
    kind: 'middleware',
    method: null,
    path: '*',
    file: rel,
    handler,
  }
}

/** A Nitro scheduled task — no request, but the same wide-event expectations. */
function fileToCronRoute(file: string, root: string, parse: ParseFn): RawRouteEntry {
  const rel = relativeFromRoot(root, file)
  const name = stripRouteFilename(basename(file))
  const parsed = parse(file)
  const handler = parsed
    ? findHandlerLocation(parsed, ['defineTask', 'defineEventHandler'])
    : null

  return {
    framework: 'nuxt',
    kind: 'cron',
    method: null,
    path: `/tasks/${name}`,
    file: rel,
    handler,
  }
}

/**
 * What evlog's Nuxt module auto-imports (`addImports` / `addServerImports`).
 *
 * An un-imported `useLogger()` or `log` is evlog's here, as long as the file
 * does not declare one itself.
 */
const NUXT_EVLOG_AUTO_IMPORTS = [
  'useLogger',
  'log',
  'createEvlogError',
] as const

/** Handlers and middleware, in whichever directories this framework serves them from. */
function extractServerRoutes(ctx: ScanContext, framework: 'nuxt' | 'nitro'): RawRouteEntry[] {
  const routes: RawRouteEntry[] = []
  const root = ctx.projectRoot
  const extract: ExtractContext = { root, parse: ctx.parse ?? parseFile, framework }

  for (const apiRoot of API_ROOTS[framework]) {
    for (const file of globSync(`${apiRoot.dir}/**/*.${HANDLER_EXT}`, { cwd: root, absolute: true })) {
      routes.push(fileToApiRoute(file, apiRoot, extract))
    }
  }

  for (const file of globSync(`${MIDDLEWARE_DIR[framework]}/**/*.${HANDLER_EXT}`, { cwd: root, absolute: true })) {
    routes.push(fileToMiddlewareRoute(file, extract))
  }

  return routes
}

/** Nuxt project: `server/api`, `server/routes`, `server/middleware`, `server/tasks` and `pages`. */
export const nuxtAdapter: FrameworkAdapter = {
  framework: 'nuxt',
  evlogAutoImports: NUXT_EVLOG_AUTO_IMPORTS,
  requestLogger: 'ambient',
  // eslint-disable-next-line require-await -- satisfies the async FrameworkAdapter contract
  async extractRoutes(ctx: ScanContext): Promise<RawRouteEntry[]> {
    const routes = extractServerRoutes(ctx, 'nuxt')
    const root = ctx.projectRoot
    const parse = ctx.parse ?? parseFile

    for (const pattern of PAGE_GLOBS) {
      for (const file of globSync(pattern, { cwd: root, absolute: true })) {
        routes.push(fileToPageRoute(file, root))
      }
    }

    for (const pattern of CRON_GLOBS) {
      for (const file of globSync(pattern, { cwd: root, absolute: true })) {
        routes.push(fileToCronRoute(file, root, parse))
      }
    }

    return routes
  },
}

/** Raw Nitro project (no Nuxt): the same handlers, one directory level up. */
export const nitroAdapter: FrameworkAdapter = {
  framework: 'nitro',
  evlogAutoImports: NUXT_EVLOG_AUTO_IMPORTS,
  requestLogger: 'ambient',
  // eslint-disable-next-line require-await -- satisfies the async FrameworkAdapter contract
  async extractRoutes(ctx: ScanContext): Promise<RawRouteEntry[]> {
    return extractServerRoutes(ctx, 'nitro')
  },
}

/** The adapter for whichever of the two Nitro-based frameworks was detected. */
export function getNuxtOrNitroAdapter(framework: 'nuxt' | 'nitro'): FrameworkAdapter {
  return framework === 'nitro' ? nitroAdapter : nuxtAdapter
}
