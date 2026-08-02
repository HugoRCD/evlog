<script setup lang="ts">
/**
 * How big this row is against the biggest one, as a small dedicated gauge.
 *
 * The previous encoding filled the row's whole background proportionally. It
 * works on paper, but at any opacity where you could actually read the ranking
 * it turned every list into a staircase of coloured blocks behind the text —
 * the measure competing with the thing being measured.
 *
 * A short track at the end of the row separates the two: the text stays on the
 * panel surface, and the comparison lives in its own 40px of space, where it
 * reads instantly and tints nothing.
 */
const props = withDefaults(defineProps<{
  value: number
  /** The largest value in the list — the full-width reference. */
  max: number
  /** Fill colour. Defaults to the chart accent. */
  color?: string
}>(), {
  color: 'var(--chart-accent)',
})

/**
 * Floored so a row with data never renders as an empty track: production
 * distributions are skewed enough that the tail would otherwise be
 * indistinguishable from zero. The exact count sits beside it, so the floor
 * costs no accuracy.
 */
const ratio = computed(() => {
  if (props.max <= 0 || props.value <= 0) return 0
  return Math.max(props.value / props.max, 0.04)
})
</script>

<template>
  <span class="relative block h-[3px] w-10 shrink-0 overflow-hidden rounded-full bg-accented" aria-hidden="true">
    <span
      class="breakdown-bar absolute inset-y-0 left-0 w-full rounded-full"
      :style="{ transform: `scaleX(${ratio})`, backgroundColor: color }"
    />
  </span>
</template>
