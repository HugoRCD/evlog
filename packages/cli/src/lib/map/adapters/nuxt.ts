import { basename } from 'node:path'
import { globSync } from 'tinyglobby'
import type { ParseFn } from '../parse'
import { findHandlerLocation, parseFile } from '../parse'
import type { FrameworkAdapter, RawRouteEntry, ScanContext } from '../types'
import { extractMethodFromFilename, relativeFromRoot, segmentsToPath, stripRouteFilename } from '../utils'

const API_GLOBS = [
  'server/api/**/*.{ts,js,mts,cts}',
  'server/routes/**/*.{ts,js,mts,cts}',
]

const PAGE_GLOBS = ['pages/**/*.vue']
const MIDDLEWARE_GLOBS = ['server/middleware/**/*.{ts,js,mts,cts}']
const CRON_GLOBS = ['server/tasks/**/*.{ts,js,mts,cts}']

function routeSegmentsFromRel(rel: string, prefix: string): string {
  let rest = rel
  if (rest.startsWith('server/api/')) {
    rest = rest.slice('server/api/'.length)
  } else if (rest.startsWith('server/routes/')) {
    rest = rest.slice('server/routes/'.length)
  }
  const parts = rest.split('/')
  const last = parts.length - 1
  parts[last] = stripRouteFilename(parts[last] ?? '')
  return segmentsToPath(parts, prefix)
}

function fileToApiRoute(file: string, root: string, parse: ParseFn): RawRouteEntry[] {
  const rel = relativeFromRoot(root, file)
  const filename = basename(file)
  const method = extractMethodFromFilename(filename)
  const routePath = routeSegmentsFromRel(rel, rel.startsWith('server/api/') ? '/api' : '')

  const parsed = parse(file)
  const handler = parsed
    ? findHandlerLocation(parsed, ['defineEventHandler', 'eventHandler'])
    : null

  return [
    {
      framework: 'nuxt',
      kind: 'api',
      method,
      path: routePath || '/',
      file: rel,
      handler,
    }
  ]
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

function fileToMiddlewareRoute(file: string, root: string, parse: ParseFn): RawRouteEntry {
  const rel = relativeFromRoot(root, file)
  const parsed = parse(file)
  const handler = parsed
    ? findHandlerLocation(parsed, ['defineEventHandler'])
    : null

  return {
    framework: 'nuxt',
    kind: 'middleware',
    method: null,
    path: '*',
    file: rel,
    handler,
  }
}

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

export const nuxtAdapter: FrameworkAdapter = {
  framework: 'nuxt',
  evlogAutoImports: NUXT_EVLOG_AUTO_IMPORTS,
  requestLogger: 'ambient',
  // eslint-disable-next-line require-await -- satisfies the async FrameworkAdapter contract
  async extractRoutes(ctx: ScanContext): Promise<RawRouteEntry[]> {
    const routes: RawRouteEntry[] = []
    const root = ctx.projectRoot
    const parse = ctx.parse ?? parseFile

    for (const pattern of API_GLOBS) {
      for (const file of globSync(pattern, { cwd: root, absolute: true })) {
        routes.push(...fileToApiRoute(file, root, parse))
      }
    }

    for (const pattern of PAGE_GLOBS) {
      for (const file of globSync(pattern, { cwd: root, absolute: true })) {
        routes.push(fileToPageRoute(file, root))
      }
    }

    for (const pattern of MIDDLEWARE_GLOBS) {
      for (const file of globSync(pattern, { cwd: root, absolute: true })) {
        routes.push(fileToMiddlewareRoute(file, root, parse))
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

/** Raw Nitro project (no Nuxt). */
export const nitroAdapter: FrameworkAdapter = {
  framework: 'nitro',
  evlogAutoImports: NUXT_EVLOG_AUTO_IMPORTS,
  requestLogger: 'ambient',
  // eslint-disable-next-line require-await -- satisfies the async FrameworkAdapter contract
  async extractRoutes(ctx: ScanContext): Promise<RawRouteEntry[]> {
    const routes: RawRouteEntry[] = []
    const root = ctx.projectRoot
    const parse = ctx.parse ?? parseFile

    const apiGlobs = ['routes/**/*.{ts,js,mts,cts}', 'api/**/*.{ts,js,mts,cts}']
    for (const pattern of apiGlobs) {
      for (const file of globSync(pattern, { cwd: root, absolute: true })) {
        const rel = relativeFromRoot(root, file)
        const filename = basename(file)
        const method = extractMethodFromFilename(filename)

        let prefix = ''
        let segmentStart = ''
        if (rel.startsWith('routes/')) {
          segmentStart = rel.slice('routes/'.length)
          prefix = ''
        } else if (rel.startsWith('api/')) {
          segmentStart = rel.slice('api/'.length)
          prefix = '/api'
        } else {
          continue
        }

        const segments = stripRouteFilename(segmentStart).split('/')
        const path = segmentsToPath(segments, prefix) || '/'
        const parsed = parse(file)
        const handler = parsed
          ? findHandlerLocation(parsed, ['defineEventHandler', 'eventHandler'])
          : null

        routes.push({
          framework: 'nitro',
          kind: 'api',
          method,
          path,
          file: rel,
          handler,
        })
      }
    }

    for (const file of globSync('middleware/**/*.{ts,js,mts,cts}', { cwd: root, absolute: true })) {
      const rel = relativeFromRoot(root, file)
      const parsed = parse(file)
      const handler = parsed
        ? findHandlerLocation(parsed, ['defineEventHandler'])
        : null
      routes.push({
        framework: 'nitro',
        kind: 'middleware',
        method: null,
        path: '*',
        file: rel,
        handler,
      })
    }

    return routes
  },
}

export function getNuxtOrNitroAdapter(framework: 'nuxt' | 'nitro'): FrameworkAdapter {
  return framework === 'nitro' ? nitroAdapter : nuxtAdapter
}
