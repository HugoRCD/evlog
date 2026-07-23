/**
 * Shared duration histogram buckets — single source of truth for the SQL
 * aggregation, the mock dataset, and the dashboard's histogram labels.
 * Auto-imported (Nuxt `shared/utils/` convention) on both sides.
 */
export interface DurationBucketDef {
  label: string
  /** Inclusive lower bound in ms. */
  min: number
  /** Exclusive upper bound in ms — `Infinity` for the last bucket. */
  max: number
}

export const DURATION_BUCKETS: readonly DurationBucketDef[] = [
  { label: '<100ms', min: 0, max: 100 },
  { label: '100–250ms', min: 100, max: 250 },
  { label: '250–500ms', min: 250, max: 500 },
  { label: '500ms–1s', min: 500, max: 1000 },
  { label: '1–2.5s', min: 1000, max: 2500 },
  { label: '>2.5s', min: 2500, max: Infinity },
]

/** Bucket index (into {@link DURATION_BUCKETS}) for a run duration. */
export function durationBucketIndex(durationMs: number): number {
  const index = DURATION_BUCKETS.findIndex(b => durationMs >= b.min && durationMs < b.max)
  return index === -1 ? DURATION_BUCKETS.length - 1 : index
}

/** Normalizes a raw Node version (`v20.11.1`, `20.11`) to its major (`20`). */
export function nodeMajor(version: string): string {
  const major = version.replace(/^v/, '').split('.')[0] ?? version
  return major || version
}
