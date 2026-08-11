import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { MapFile } from './types'

/** Name of the map file at the project root — written here, read by `--baseline`. */
export const MAP_FILE_NAME = 'evlog.map.json'

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
  const outPath = join(projectRoot, MAP_FILE_NAME)
  writeFileSync(outPath, `${JSON.stringify(sortedRoutes(map), null, 2)}\n`, 'utf8')
  return outPath
}

/** The map as it would be written, routes sorted, without touching the disk. */
export function serializeMapFile(map: MapFile): string {
  return JSON.stringify(sortedRoutes(map), null, 2)
}

/** {@link MapFile} with `generatedAt` and `cliVersion` redacted — stable across test runs for snapshotting. Both churn on every release, while `ruleSetVersion` stays, so a snapshot only moves when the rule set actually changes. */
export function mapForSnapshot(map: MapFile): Omit<MapFile, 'generatedAt' | 'cliVersion'> & { generatedAt: '[REDACTED]', cliVersion: '[REDACTED]' } {
  return {
    ...sortedRoutes(map),
    generatedAt: '[REDACTED]',
    cliVersion: '[REDACTED]',
  }
}
