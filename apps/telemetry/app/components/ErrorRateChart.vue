<script setup lang="ts">
const props = defineProps<{
  timeline: ActivityPoint[]
  granularity: TimelineGranularity
}>()

interface ErrorRatePoint {
  label: string
  rate: number
  runs: number
  errors: number
}

const categories: Record<string, BulletLegendItemInterface> = {
  rate: { name: 'Error rate', color: 'var(--chart-error)' },
}

/** Same reasoning as `LatencyChart`: an empty bucket has no rate, not a rate of zero. */
const data = computed<ErrorRatePoint[]>(() =>
  props.timeline
    .filter(point => point.success + point.errors > 0)
    .map((point) => {
      const runs = point.success + point.errors
      return {
        label: formatBucket(point.bucket, props.granularity),
        rate: Math.round(percentageOf(point.errors, runs) * 10) / 10,
        runs,
        errors: point.errors,
      }
    }),
)

const peak = computed(() => Math.max(0, ...data.value.map(point => point.rate)))

function xFormatter(tick: number) {
  return data.value[Math.round(tick)]?.label ?? ''
}

const xNumTicks = computed(() => bucketTickCount(data.value.length))

/** What this chart plots, in order — its half of the shared-cursor contract. */
const labels = computed(() => data.value.map(point => point.label))
</script>

<template>
  <PanelCard title="Error rate over time" subtitle="Share of runs that failed, per bucket" flush>
    <template #actions>
      <span class="text-[11px] tabular-nums" :class="peak > 0 ? 'text-muted' : 'text-dimmed'">peak {{ peak }}%</span>
    </template>

    <EmptyState
      v-if="data.length < 2"
      message="Not enough data to plot a trend."
      hint="At least two buckets with runs are needed."
    />

    <ChartFrame v-else :labels :height="172">
      <AreaChart
        :data
        :height="172"
        :categories
        :y-grid-line="true"
        :y-num-ticks="4"
        :line-width="1.5"
        :x-formatter
        :x-num-ticks
        :y-formatter="(tick: number) => `${tick}%`"
        :y-domain="[0, undefined]"
        :hide-legend="true"
      >
        <template #tooltip="{ values }">
          <ChartTooltip :title="values?.label">
            <div class="flex items-center justify-between gap-4">
              <span class="text-[11px] text-muted">Error rate</span>
              <span class="text-[11px] font-medium text-highlighted tabular-nums">{{ values?.rate ?? 0 }}%</span>
            </div>
            <div class="flex items-center justify-between gap-4">
              <span class="text-[11px] text-dimmed">Failed</span>
              <span class="text-[11px] text-dimmed tabular-nums">{{ values?.errors ?? 0 }} of {{ values?.runs ?? 0 }}</span>
            </div>
          </ChartTooltip>
        </template>
      </AreaChart>
    </ChartFrame>
  </PanelCard>
</template>
