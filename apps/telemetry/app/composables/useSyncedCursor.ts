/**
 * One hovered bucket, shared by every chart on screen.
 *
 * Correlating a spike in runs with a spike in p95 used to mean hovering one
 * chart, remembering a number, then hovering another. With a shared cursor the
 * comparison is just there.
 *
 * The shared value is the bucket's *label*, not its index. Charts drop buckets
 * that have no runs — a latency line has nothing to plot for an empty day — so
 * two charts over the same range routinely hold different numbers of points,
 * and an index would line them up wrongly the moment one of them had a gap.
 */
const label = ref<string | null>(null)

export function useSyncedCursor() {
  return {
    /** The bucket under the pointer, or `null` when no chart is hovered. */
    label: readonly(label),

    set(next: string | null) {
      label.value = next
    },

    clear() {
      label.value = null
    },
  }
}
