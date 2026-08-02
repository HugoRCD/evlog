/**
 * Axis and tooltip labels for anything plotted over a timeline bucket, so the
 * activity, latency, error-rate, version and machine charts all read the same
 * way on the same x-axis.
 */

/** A bucket key (`2026-03-15` or `2026-03-15T14:00`) as a short axis label. */
export function formatBucket(bucket: string, granularity: TimelineGranularity): string {
  const date = new Date(granularity === 'hour' ? `${bucket}:00Z` : `${bucket}T00:00:00Z`)
  return granularity === 'hour'
    ? date.toLocaleTimeString(undefined, { hour: 'numeric' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * Caps how many x-axis ticks a chart asks for — 30 daily buckets would
 * otherwise crowd their labels into an unreadable smear.
 */
export function bucketTickCount(bucketCount: number): number {
  return Math.min(bucketCount, 8)
}

/** `1,240ms` / `2.4s` — durations stay legible across the three orders of magnitude runs land in. */
export function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
}
