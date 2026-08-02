<script setup lang="ts">
/**
 * The shared cursor's vertical rule, isolated in its own component.
 *
 * That isolation is the whole point. When `ChartFrame` read the cursor itself,
 * hovering a chart wrote to shared state, which re-rendered the frame, which
 * re-rendered the chart inside it, which rebuilt the tooltip that had written
 * the state in the first place — a feedback loop, visible as a tooltip
 * flickering under the pointer.
 *
 * Reading that state here instead means only this element re-renders. The
 * frame never subscribes, so the chart it hosts is left alone.
 */
const props = defineProps<{
  /** Bucket labels in plot order, for locating the shared bucket in this chart. */
  labels: string[]
}>()

const cursor = useSyncedCursor()

/**
 * Bars and points sit at the centre of their slot, so the rule is drawn at the
 * midpoint rather than at the leading edge. `null` when this chart doesn't
 * plot the hovered bucket — charts drop empty buckets, so that is routine.
 */
const position = computed(() => {
  if (!cursor.label.value || props.labels.length === 0) return null

  const index = props.labels.indexOf(cursor.label.value)
  if (index === -1) return null

  return `${((index + 0.5) / props.labels.length) * 100}%`
})
</script>

<template>
  <div
    v-if="position"
    class="pointer-events-none absolute bottom-6 top-1 z-20 w-px bg-[--chart-accent] opacity-60"
    :style="{ left: position }"
    aria-hidden="true"
  >
    <span class="absolute -top-0.5 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-[--chart-accent]" />
  </div>
</template>
