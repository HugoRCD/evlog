<script setup lang="ts">
/**
 * Shared by both shapes `ActivityChart` renders — the dual chart when there's
 * a previous period to draw, the plain bar chart when there isn't — so the two
 * can never drift into showing different numbers for the same hover.
 */

/** One plotted bucket — also the row shape `ActivityChart` builds its chart data from. */
export interface ActivityPlotPoint {
  label: string
  success: number
  errors: number
  /** Runs in the same bucket one window earlier. */
  previous: number
}

const props = defineProps<{
  /** The hovered row, as handed over by the chart's `#tooltip` slot. */
  values: ActivityPlotPoint | undefined
  series: { key: 'success' | 'errors', name: string, color: string }[]
  hasPrevious: boolean
}>()

const total = computed(() =>
  props.series.reduce((sum, serie) => sum + Number(props.values?.[serie.key] ?? 0), 0),
)

const previous = computed(() => Number(props.values?.previous ?? 0))

/** Change against the same bucket one window earlier — `null` when that bucket was empty. */
const delta = computed(() => relativeDelta(total.value, previous.value))

function format(value: number) {
  return value.toLocaleString()
}
</script>

<template>
  <ChartTooltip :title="values?.label">
    <div v-for="serie in series" :key="serie.key" class="flex items-center justify-between gap-4">
      <span class="flex min-w-0 items-center gap-1.5">
        <span class="size-1.5 shrink-0 rounded-full" :style="{ backgroundColor: serie.color }" />
        <span class="truncate text-[11px] text-muted">{{ serie.name }}</span>
      </span>
      <span class="shrink-0 text-[11px] font-medium text-highlighted tabular-nums">
        {{ format(Number(values?.[serie.key] ?? 0)) }}
      </span>
    </div>

    <div v-if="hasPrevious" class="mt-0.5 flex items-center justify-between gap-4 border-t border-muted pt-1.5">
      <span class="text-[11px] text-dimmed">Previous</span>
      <span class="flex shrink-0 items-center gap-2 text-[11px] tabular-nums">
        <span v-if="delta !== null" :class="delta > 0 ? 'text-success' : delta < 0 ? 'text-error' : 'text-dimmed'">
          {{ delta > 0 ? '+' : '−' }}{{ Math.abs(Math.round(delta * 100)) }}%
        </span>
        <span class="text-dimmed">{{ format(previous) }}</span>
      </span>
    </div>
  </ChartTooltip>
</template>
