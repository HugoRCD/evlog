import { describe, expect, it } from 'vitest'
import type { MapFile, RouteEntry } from '../../src/lib/map/types'
import { serializeMapFile } from '../../src/lib/map/write'

function route(path: string, method: string | null = null): RouteEntry {
  return {
    id: path,
    framework: 'nuxt',
    kind: 'api',
    method,
    path,
    file: `server/api${path}.ts`,
    handler: null,
    checks: {},
    suggestions: {},
    sensitivity: { level: 'none', reasons: [] },
    score: 100,
  }
}

function mapOf(routes: RouteEntry[]): MapFile {
  return {
    version: 1,
    generatedAt: '2026-01-01T00:00:00.000Z',
    framework: 'nuxt',
    projectName: 'test',
    score: 100,
    routes,
  }
}

function pathsOf(map: MapFile): string[] {
  const parsed = JSON.parse(serializeMapFile(map)) as { routes: Array<{ path: string, method: string | null }> }
  return parsed.routes.map(entry => `${entry.method ?? '*'} ${entry.path}`)
}

describe('serializeMapFile', () => {
  it('orders routes by code point, not by the machine locale', () => {
    /* `localeCompare` puts `/api/apple` before `/api/Zebra` in most locales and
       after it in code-point order, so a committed map would reshuffle itself
       depending on whose laptop ran the scan. */
    expect(pathsOf(mapOf([route('/api/apple'), route('/api/Zebra')])))
      .toEqual(['* /api/Zebra', '* /api/apple'])
  })

  it('breaks ties on the method, also by code point', () => {
    expect(pathsOf(mapOf([route('/api/orders', 'POST'), route('/api/orders', 'GET')])))
      .toEqual(['GET /api/orders', 'POST /api/orders'])
  })

  it('leaves the input untouched', () => {
    const routes = [route('/b'), route('/a')]
    serializeMapFile(mapOf(routes))
    expect(routes.map(entry => entry.path)).toEqual(['/b', '/a'])
  })
})
