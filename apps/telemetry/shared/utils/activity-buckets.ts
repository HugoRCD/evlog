/**
 * Shared day/hour bucket generation for the daily activity chart — single
 * source of truth for the SQL aggregation, the mock dataset, and the
 * dashboard chart. Every bucket in the current range is pre-filled with zero
 * counts before merging in real rows, so the chart always plots a full,
 * fixed-width timeline (e.g. exactly 7 bars for the 7-day range) instead of
 * shrinking to whichever days happen to have events.
 * Auto-imported (Nuxt `shared/utils/` convention) on both sides.
 */

/** Number of daily buckets to render for a given stats range (`24h` isn't day-bucketed — it uses {@link hourlyBucketKeys}). */
export function dailyBucketCount(range: StatsRange): number {
  return range === '30d' ? 30 : 7
}

/** `YYYY-MM-DD` keys for the last `days` calendar days (oldest first, ending today), matching the SQL `to_char(date_trunc('day', ts), 'YYYY-MM-DD')` format. */
export function dailyBucketKeys(days: number, now = Date.now()): string[] {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(now - (days - 1 - i) * 24 * 60 * 60 * 1000)
    return date.toISOString().slice(0, 10)
  })
}

/** `YYYY-MM-DDTHH:00` keys for the last `hours` hours (oldest first, ending in the current hour), matching the SQL `to_char(date_trunc('hour', ts), 'YYYY-MM-DD"T"HH24:00')` format. */
export function hourlyBucketKeys(hours: number, now = Date.now()): string[] {
  return Array.from({ length: hours }, (_, i) => {
    const date = new Date(now - (hours - 1 - i) * 60 * 60 * 1000)
    return `${date.toISOString().slice(0, 13)}:00`
  })
}

/** Zero-fills every key in `keys` that has no matching row, preserving key order. */
export function fillDailyActivity(keys: string[], rows: DailyActivity[]): DailyActivity[] {
  const byDay = new Map(rows.map(r => [r.day, r]))
  return keys.map(day => ({ day, success: byDay.get(day)?.success ?? 0, errors: byDay.get(day)?.errors ?? 0 }))
}

/** Zero-fills every key in `keys` that has no matching row, preserving key order. */
export function fillHourlyActivity(keys: string[], rows: HourlyActivity[]): HourlyActivity[] {
  const byHour = new Map(rows.map(r => [r.hour, r]))
  return keys.map(hour => ({ hour, success: byHour.get(hour)?.success ?? 0, errors: byHour.get(hour)?.errors ?? 0 }))
}
