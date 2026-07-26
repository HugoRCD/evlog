import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { MapFile } from './types'

/**
 * Code-point order, not collation.
 *
 * `localeCompare` reads the machine's locale, so the same map serializes in a
 * different route order on a different laptop — which shows up as a phantom
 * diff in a committed `evlog.map.json` and as a flaky snapshot in CI.
 */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function sortedRoutes(map: MapFile): MapFile {
  return {
    ...map,
    routes: [...map.routes].sort((a, b) => compare(a.path, b.path) || compare(a.method ?? '', b.method ?? '')),
  }
}

/** Write `evlog.map.json` to `projectRoot` (routes sorted for a stable diff). Returns the path written. */
export function writeMapFile(projectRoot: string, map: MapFile): string {
  const outPath = join(projectRoot, 'evlog.map.json')
  writeFileSync(outPath, `${JSON.stringify(sortedRoutes(map), null, 2)}\n`, 'utf8')
  return outPath
}

/** The map as it would be written, routes sorted, without touching the disk. */
export function serializeMapFile(map: MapFile): string {
  return JSON.stringify(sortedRoutes(map), null, 2)
}

/** {@link MapFile} with `generatedAt` redacted — stable across test runs for snapshotting. */
export function mapForSnapshot(map: MapFile): Omit<MapFile, 'generatedAt'> & { generatedAt: '[REDACTED]' } {
  return {
    ...sortedRoutes(map),
    generatedAt: '[REDACTED]',
  }
}
