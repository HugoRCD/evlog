<script setup lang="ts">
const props = defineProps<{
  timeline: ActivityPoint[]
  granularity: TimelineGranularity
}>()

interface LatencyPoint {
  label: string
  avg: number
  p95: number
}

/** One hue, two steps — the two series are the same measure at different percentiles. */
const SERIES: { key: 'avg' | 'p95', name: string, color: string }[] = [
  { key: 'avg', name: 'Average', color: 'var(--chart-series-3)' },
  { key: 'p95', name: 'p95', color: 'var(--chart-accent)' },
]

const categories: Record<string, BulletLegendItemInterface> = Object.fromEntries(
  SERIES.map(s => [s.key, { name: s.name, color: s.color }]),
)

/**
 * Buckets with no runs have no latency to report — plotting their zeroes would
 * draw a cliff down to the axis and back, which reads as a latency collapse
 * rather than as an absence of data. They're dropped from the line instead.
 */
const data = computed<LatencyPoint[]>(() =>
  props.timeline
    .filter(point => point.success + point.errors > 0)
    .map(point => ({
      label: formatBucket(point.bucket, props.granularity),
      avg: point.avgDurationMs,
      p95: point.p95DurationMs,
    })),
)

function xFormatter(tick: number) {
  return data.value[Math.round(tick)]?.label ?? ''
}

const xNumTicks = computed(() => bucketTickCount(data.value.length))

/** What this chart plots, in order — its half of the shared-cursor contract. */
const labels = computed(() => data.value.map(point => point.label))
</script>

<template>
  <PanelCard title="Latency over time" subtitle="Average and p95 run duration per bucket" flush>
    <EmptyState
      v-if="data.length < 2"
      message="Not enough data to plot a trend."
      hint="At least two buckets with runs are needed."
    />

    <ChartFrame v-else legend :labels :height="196">
      <LineChart
        :data
        :height="196"
        :categories
        :line-width="1.5"
        :y-grid-line="true"
        :y-num-ticks="4"
        :x-formatter
        :x-num-ticks
        :y-formatter="(tick: number) => formatDuration(tick)"
        :legend-position="LegendPosition.TopRight"
      >
        <template #tooltip="{ values }">
          <ChartTooltip :title="values?.label">
            <div v-for="serie in SERIES" :key="serie.key" class="flex items-center justify-between gap-4">
              <span class="flex min-w-0 items-center gap-1.5">
                <span class="size-1.5 shrink-0 rounded-full" :style="{ backgroundColor: serie.color }" />
                <span class="truncate text-[11px] text-muted">{{ serie.name }}</span>
              </span>
              <span class="shrink-0 text-[11px] font-medium text-highlighted tabular-nums">{{ formatDuration(values?.[serie.key] ?? 0) }}</span>
            </div>
          </ChartTooltip>
        </template>
      </LineChart>
    </ChartFrame>
  </PanelCard>
</template>
