/**
 * Shaping for the Adoption tab's two aggregations whose SQL output needs a
 * second pass in JS: version adoption (long rows → one stacked point per
 * bucket) and the jsonb field breakdowns (key/value rows → a key with its
 * value distribution). Both the real queries and the mock dataset feed the
 * same intermediate rows in, so the two can never drift.
 * Auto-imported (Nuxt `shared/utils/` convention) on both sides — the one
 * explicit import is for `mock-data.ts`, which is unit-tested outside Nitro's
 * auto-import context and pulls this module in directly.
 */

import { fillTimeline } from './timeline-buckets'

/** Series the least-used versions are folded into, so the chart keeps a readable number of bands. */
export const OTHER_VERSION = 'other'

/** How many versions get their own band before the rest collapse into {@link OTHER_VERSION}. */
const MAX_VERSION_SERIES = 5

/** How many distinct keys the flags/custom cards show. */
const MAX_FIELD_KEYS = 8

/** How many values each key shows. */
const MAX_FIELD_VALUES = 6

/** One `(bucket, version) → count` row, as grouped by SQL or tallied from the mock dataset. */
export interface VersionBucketRow {
  bucket: string
  version: string
  count: number
}

/**
 * Long `(bucket, version, count)` rows into one stacked point per bucket, plus
 * the series list to plot. Versions outside the top {@link MAX_VERSION_SERIES}
 * are merged into a single `other` band.
 */
export function toVersionAdoption(
  rows: VersionBucketRow[],
  keys: string[],
): { versions: string[], points: VersionAdoptionPoint[] } {
  const totals = new Map<string, number>()
  for (const row of rows) totals.set(row.version, (totals.get(row.version) ?? 0) + row.count)

  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([version]) => version)
  const top = new Set(ranked.slice(0, MAX_VERSION_SERIES))
  const versions = ranked.length > top.size ? [...top, OTHER_VERSION] : [...top]

  const zero = () => Object.fromEntries(versions.map(version => [version, 0]))

  const byBucket = new Map<string, Record<string, number>>()
  for (const row of rows) {
    const counts = byBucket.get(row.bucket) ?? zero()
    const series = top.has(row.version) ? row.version : OTHER_VERSION
    counts[series] = (counts[series] ?? 0) + row.count
    byBucket.set(row.bucket, counts)
  }

  const points = fillTimeline(
    keys,
    [...byBucket].map(([bucket, counts]) => ({ bucket, counts })),
    bucket => ({ bucket, counts: zero() }),
  )

  return { versions, points }
}

/** One `(key, value) → count` row from a `flags`/`custom` jsonb breakdown. */
export interface FieldValueRow {
  key: string
  value: string
  count: number
  errors: number
}

/** Flat `(key, value)` rows into per-key stats, most used key first, each with its top values. */
export function toFieldStats(rows: FieldValueRow[]): FieldStat[] {
  const byKey = new Map<string, FieldStat>()

  for (const row of rows) {
    const stat = byKey.get(row.key) ?? { key: row.key, count: 0, errors: 0, values: [] }
    stat.count += row.count
    stat.errors += row.errors
    stat.values.push({ value: row.value, count: row.count, errors: row.errors })
    byKey.set(row.key, stat)
  }

  return [...byKey.values()]
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, MAX_FIELD_KEYS)
    .map(stat => ({
      ...stat,
      values: stat.values.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)).slice(0, MAX_FIELD_VALUES),
    }))
}
