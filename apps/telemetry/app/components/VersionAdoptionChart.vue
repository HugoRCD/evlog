<script setup lang="ts">
const props = defineProps<{
  versions: string[]
  points: VersionAdoptionPoint[]
  granularity: TimelineGranularity
}>()

/**
 * Versions succeed one another, so they get one hue stepped from strongest
 * (the most used, usually the newest) back toward the ground — a rollout then
 * reads as the dark band eating the pale ones, instead of as four unrelated
 * colours swapping places.
 */
const SERIES_COLORS = [
  'var(--chart-series-1)',
  'var(--chart-series-2)',
  'var(--chart-series-3)',
  'var(--chart-series-4)',
  'var(--chart-series-5)',
  'var(--chart-series-6)',
]

function colorFor(index: number) {
  return SERIES_COLORS[index % SERIES_COLORS.length]!
}

const categories = computed<Record<string, BulletLegendItemInterface>>(() =>
  Object.fromEntries(props.versions.map((version, index) => [
    version,
    { name: version, color: colorFor(index) },
  ])),
)

/** `AreaChart` reads each series straight off the data row, so the counts are flattened up one level — the series keys are version strings, only known at runtime. */
interface AdoptionRow {
  label: string
  [version: string]: string | number
}

const data = computed<AdoptionRow[]>(() => props.points.map(point => ({
  label: formatBucket(point.bucket, props.granularity),
  ...point.counts,
})))

const empty = computed(() => props.points.every(point => Object.values(point.counts).every(count => count === 0)))

function xFormatter(tick: number) {
  return data.value[Math.round(tick)]?.label ?? ''
}

const xNumTicks = computed(() => bucketTickCount(data.value.length))

/** What this chart plots, in order — its half of the shared-cursor contract. */
const labels = computed(() => data.value.map(point => point.label))
</script>

<template>
  <PanelCard title="Version adoption" subtitle="How fast a release takes over" flush>
    <EmptyState
      v-if="empty"
      message="No runs in this range."
      hint="Widen the time range, or clear a filter."
    />

    <ChartFrame v-else legend :labels :height="216">
      <AreaChart
        :data
        :height="216"
        :categories
        :stacked="true"
        :line-width="1"
        :y-grid-line="true"
        :y-num-ticks="4"
        :x-formatter
        :x-num-ticks
        :legend-position="LegendPosition.TopRight"
      >
        <template #tooltip="{ values }">
          <ChartTooltip :title="values?.label">
            <div v-for="(version, index) in versions" :key="version" class="flex items-center justify-between gap-4">
              <span class="flex min-w-0 items-center gap-1.5">
                <span class="size-1.5 shrink-0 rounded-full" :style="{ backgroundColor: colorFor(index) }" />
                <span class="truncate font-mono text-[11px] text-muted">{{ version }}</span>
              </span>
              <span class="shrink-0 text-[11px] font-medium text-highlighted tabular-nums">{{ values?.[version] ?? 0 }}</span>
            </div>
          </ChartTooltip>
        </template>
      </AreaChart>
    </ChartFrame>
  </PanelCard>
</template>
