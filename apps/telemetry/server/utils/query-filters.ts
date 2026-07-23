const RANGE_TO_HOURS: Record<StatsRange, number> = {
  '24h': 24,
  '7d': 7 * 24,
  '30d': 30 * 24,
}

/** Parse the `range` query param, defaulting to `7d` for anything unrecognised. */
export function parseRange(value: unknown): StatsRange {
  return value === '24h' || value === '7d' || value === '30d' ? value : '7d'
}

/** Cutoff `Date` for a given range, e.g. `7d` → 7*24h ago from `now`. */
export function rangeToCutoff(range: StatsRange, now = Date.now()): Date {
  return new Date(now - RANGE_TO_HOURS[range] * 60 * 60 * 1000)
}

/** Parse an optional non-empty string query param. */
export function parseOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Clamp a `limit` query param to a sane page size. */
export function clampLimit(value: unknown, fallback = 25, max = 100): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : Number.NaN
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(Math.floor(n), max)
}

const RUN_SORT_KEYS: RunSortKey[] = ['timestamp', 'tool', 'command', 'environment', 'outcome', 'durationMs', 'machineId']

/** Parse the `sort` query param, defaulting to `timestamp` for anything unrecognised. */
export function parseSort(value: unknown): RunSortKey {
  return RUN_SORT_KEYS.includes(value as RunSortKey) ? (value as RunSortKey) : 'timestamp'
}

/** Parse the `order` query param, defaulting to `desc` for anything unrecognised. */
export function parseOrder(value: unknown): SortOrder {
  return value === 'asc' ? 'asc' : 'desc'
}

/** Parse the `page` query param (1-based), defaulting to `1` for anything invalid. */
export function parsePage(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

/** Shared `range`/`tool`/`environment` filter parsing for `runs.get.ts` and `stats.get.ts`. */
export function parseRunsFilter(query: Record<string, unknown>): RunsFilter {
  return {
    range: parseRange(query.range),
    tool: parseOptionalString(query.tool),
    environment: parseOptionalString(query.environment),
  }
}
