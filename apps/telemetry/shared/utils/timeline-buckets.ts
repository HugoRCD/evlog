/**
 * Shared timeline bucketing — single source of truth for the SQL aggregation,
 * the mock dataset, and every dashboard chart plotted over time. Each bucket
 * in the current range is pre-filled with zeroes before merging in real rows,
 * so a chart always plots a full, fixed-width timeline (exactly 7 bars for the
 * 7-day range) instead of shrinking to whichever buckets happen to have events.
 * Auto-imported (Nuxt `shared/utils/` convention) on both sides.
 */

const RANGE_GRANULARITY: Record<StatsRange, TimelineGranularity> = {
  '24h': 'hour',
  '7d': 'day',
  '30d': 'day',
}

const RANGE_BUCKETS: Record<StatsRange, number> = {
  '24h': 24,
  '7d': 7,
  '30d': 30,
}

/** Bucket width for a range — hourly only makes sense on the 24h view. */
export function timelineGranularity(range: StatsRange): TimelineGranularity {
  return RANGE_GRANULARITY[range]
}

/** How many buckets a range's timeline spans. */
export function timelineBucketCount(range: StatsRange): number {
  return RANGE_BUCKETS[range]
}

const BUCKET_MS: Record<TimelineGranularity, number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
}

/**
 * Bucket keys for a range, oldest first and ending in the current bucket.
 * `YYYY-MM-DD` for days, `YYYY-MM-DDTHH:00` for hours — matching the
 * `to_char(date_trunc(...))` formats used by the SQL aggregation.
 */
export function timelineBucketKeys(range: StatsRange, now = Date.now()): string[] {
  const granularity = timelineGranularity(range)
  const count = timelineBucketCount(range)
  const step = BUCKET_MS[granularity]

  return Array.from({ length: count }, (_, i) => {
    const date = new Date(now - (count - 1 - i) * step)
    return timelineBucketKey(date.toISOString(), granularity)
  })
}

/**
 * Bucket keys for the window immediately before `range` — same count and
 * width, so the previous period's series lines up index-for-index with the
 * current one.
 */
export function previousTimelineBucketKeys(range: StatsRange, now = Date.now()): string[] {
  const step = BUCKET_MS[timelineGranularity(range)]
  return timelineBucketKeys(range, now - timelineBucketCount(range) * step)
}

/** The bucket an ISO timestamp falls into, at a given granularity. */
export function timelineBucketKey(timestamp: string, granularity: TimelineGranularity): string {
  return granularity === 'hour' ? `${timestamp.slice(0, 13)}:00` : timestamp.slice(0, 10)
}

/** Zero-fills every key in `keys` that has no matching row, preserving key order. */
export function fillTimeline<T extends { bucket: string }>(
  keys: string[],
  rows: T[],
  empty: (bucket: string) => T,
): T[] {
  const byBucket = new Map(rows.map(row => [row.bucket, row]))
  return keys.map(bucket => byBucket.get(bucket) ?? empty(bucket))
}

/** An {@link ActivityPoint} with every metric at zero — the shape a bucket with no runs takes. */
export function emptyActivityPoint(bucket: string): ActivityPoint {
  return { bucket, success: 0, errors: 0, machines: 0, avgDurationMs: 0, p95DurationMs: 0 }
}
