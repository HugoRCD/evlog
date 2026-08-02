/**
 * Period-over-period math for the KPI cards. Kept out of the components so
 * the "what counts as an improvement" rules are stated once and unit-tested,
 * rather than re-derived per card.
 * Auto-imported (Nuxt `shared/utils/` convention) on both sides.
 */

/**
 * Relative change from `previous` to `current`, as a ratio (`0.12` = +12%).
 *
 * `null` whenever there is no meaningful baseline — a previous window of zero
 * has no percentage to grow by, and rendering "+∞%" or a bare "+100%" for the
 * very first day of data would read as a real trend rather than as an absence
 * of history.
 */
export function relativeDelta(current: number, previous: number): number | null {
  if (previous === 0) return null
  return (current - previous) / previous
}

/** Percentage-point change for metrics that are already percentages (`2` = +2pt). */
export function pointDelta(current: number, previous: number): number {
  return current - previous
}

/** Share of `part` in `total`, as a 0–100 percentage. `0` when there is nothing to divide. */
export function percentageOf(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0
}
