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

import { groupFieldStats } from './field-dimensions'
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

/** One `(bucket, series, count)` row, before it is folded into a stacked timeline. */
export interface SeriesBucketRow {
  bucket: string
  series: string
  count: number
}

/**
 * Long `(bucket, series, count)` rows into one stacked point per bucket, plus
 * the series list to plot, zero-filled across every bucket in `keys`.
 *
 * Series outside the top `maxSeries` are merged into a single `other` band, so
 * a long tail cannot turn the chart into a colour salad.
 */
export function toStackedSeries(
  rows: SeriesBucketRow[],
  keys: string[],
  maxSeries: number,
): { series: string[], points: VersionAdoptionPoint[] } {
  const totals = new Map<string, number>()
  for (const row of rows) totals.set(row.series, (totals.get(row.series) ?? 0) + row.count)

  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name)
  const top = new Set(ranked.slice(0, maxSeries))
  const series = ranked.length > top.size ? [...top, OTHER_VERSION] : [...top]

  const zero = () => Object.fromEntries(series.map(name => [name, 0]))

  const byBucket = new Map<string, Record<string, number>>()
  for (const row of rows) {
    const counts = byBucket.get(row.bucket) ?? zero()
    const name = top.has(row.series) ? row.series : OTHER_VERSION
    counts[name] = (counts[name] ?? 0) + row.count
    byBucket.set(row.bucket, counts)
  }

  const points = fillTimeline(
    keys,
    [...byBucket].map(([bucket, counts]) => ({ bucket, counts })),
    bucket => ({ bucket, counts: zero() }),
  )

  return { series, points }
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
  const { series, points } = toStackedSeries(
    rows.map(row => ({ bucket: row.bucket, series: row.version, count: row.count })),
    keys,
    MAX_VERSION_SERIES,
  )
  return { versions: series, points }
}

/** One `(key, value) → count` row from a `flags`/`custom` jsonb breakdown. */
export interface FieldValueRow {
  key: string
  value: string
  count: number
  errors: number
}

/** citty's positional bucket — a count of it says nothing about flags. */
const POSITIONAL_KEY = '_'

/** `min-score` → `minScore`, matching `@evlog/telemetry`'s client-side sanitizer. */
export function normalizeFlagKey(key: string): string | null {
  if (key === POSITIONAL_KEY) return null
  return key.replace(/-([a-z0-9])/gi, (_, char: string) => char.toUpperCase())
}

/**
 * Legacy clients sent raw citty args, so one flag arrived under both spellings
 * (`no-header` and `noHeader`) and the `_` positional bucket leaked through.
 * Collapse rows into the normalized names before tallying.
 */
export function normalizeFlagRows(rows: FieldValueRow[]): FieldValueRow[] {
  const merged = new Map<string, FieldValueRow>()
  for (const row of rows) {
    const key = normalizeFlagKey(row.key)
    if (key === null) continue
    const id = `${key}\u0000${row.value}`
    const existing = merged.get(id)
    if (existing) {
      existing.count += row.count
      existing.errors += row.errors
    } else {
      merged.set(id, { key, value: row.value, count: row.count, errors: row.errors })
    }
  }
  return [...merged.values()]
}

/** Flat `(key, value)` rows into per-key stats, unsorted and uncapped. */
function tallyByKey(rows: FieldValueRow[]): FieldStat[] {
  const byKey = new Map<string, FieldStat>()

  for (const row of rows) {
    const stat = byKey.get(row.key) ?? { key: row.key, count: 0, errors: 0, values: [] }
    stat.count += row.count
    stat.errors += row.errors
    stat.values.push({ value: row.value, count: row.count, errors: row.errors })
    byKey.set(row.key, stat)
  }

  return [...byKey.values()]
}

/** Most used first, each key carrying its most used values. */
function rank(stats: FieldStat[], maxValues: number): FieldStat[] {
  return stats
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .map(stat => ({
      ...stat,
      values: stat.values.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)).slice(0, maxValues),
    }))
}

/** Flat `(key, value)` rows into per-key stats, most used key first, each with its top values. */
export function toFieldStats(rows: FieldValueRow[]): FieldStat[] {
  return rank(tallyByKey(rows), MAX_FIELD_VALUES).slice(0, MAX_FIELD_KEYS)
}

/**
 * Same tally, split into the keys that get their own panel and the rest.
 *
 * Promoted keys are taken before the top-{@link MAX_FIELD_KEYS} cut and keep
 * every value: a tool reporting forty counters would otherwise push its own
 * headline dimension out of the list, and a framework missing from the chart
 * because it ranked ninth is worse than no chart.
 */
export function splitFieldStats(
  rows: FieldValueRow[],
  promotedKeys: readonly string[],
): { dimensions: FieldStat[], fields: FieldStat[] } {
  const promoted = new Set(promotedKeys)
  const all = tallyByKey(rows)

  /* Capped per reporting command rather than globally: `map` reports forty
     counters and `doctor` reports seven, so one global top-8 would show the
     map fields and nothing else — a command disappearing from the breakdown
     because another one is chattier is worse than a longer list. */
  const rest = rank(all.filter(stat => !promoted.has(stat.key)), MAX_FIELD_VALUES)
  const capped = groupFieldStats(rest).flatMap(({ fields }) => fields.slice(0, MAX_FIELD_KEYS))

  return {
    dimensions: rank(all.filter(stat => promoted.has(stat.key)), Number.POSITIVE_INFINITY),
    fields: capped.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
  }
}

/**
 * Several keys carrying the same vocabulary into one value distribution.
 *
 * `initFramework` and `mapFramework` are two commands answering "which
 * framework", and the question wants them added up rather than shown twice.
 */
export function mergeFieldValues(stats: FieldStat[]): FieldValueStat[] {
  const byValue = new Map<string, FieldValueStat>()

  for (const stat of stats) {
    for (const value of stat.values) {
      const merged = byValue.get(value.value) ?? { value: value.value, count: 0, errors: 0 }
      merged.count += value.count
      merged.errors += value.errors
      byValue.set(value.value, merged)
    }
  }

  return [...byValue.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}
