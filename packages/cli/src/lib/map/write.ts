import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { MapFile } from './types'

function sortedRoutes(map: MapFile): MapFile {
  return {
    ...map,
    routes: [...map.routes].sort((a, b) => a.path.localeCompare(b.path) || (a.method ?? '').localeCompare(b.method ?? '')),
  }
}

/** Write `evlog.map.json` to `projectRoot` (routes sorted for a stable diff). Returns the path written. */
export function writeMapFile(projectRoot: string, map: MapFile): string {
  const outPath = join(projectRoot, 'evlog.map.json')
  writeFileSync(outPath, `${JSON.stringify(sortedRoutes(map), null, 2)}\n`, 'utf8')
  return outPath
}

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
