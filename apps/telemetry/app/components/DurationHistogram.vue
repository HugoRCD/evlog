<script setup lang="ts">
const props = defineProps<{
  durations: DurationStats
}>()

const categories: Record<string, BulletLegendItemInterface> = {
  count: { name: 'Runs', color: 'var(--chart-accent)' },
}

const data = computed(() => props.durations.histogram)

const empty = computed(() => data.value.every(b => b.count === 0))

/** `BarChart` plots bars at numeric indices — map ticks back to bucket labels. */
function xFormatter(tick: number) {
  return data.value[Math.round(tick)]?.bucket ?? ''
}
</script>

<template>
  <PanelCard title="Durations" subtitle="How run times are spread across the range" flush>
    <template #actions>
      <span class="text-[11px] text-dimmed tabular-nums">p50 {{ formatDuration(durations.p50) }}</span>
      <span class="text-[11px] text-muted tabular-nums">p95 {{ formatDuration(durations.p95) }}</span>
    </template>

    <EmptyState
      v-if="empty"
      message="No runs in this range."
      hint="Widen the time range, or clear a filter."
    />

    <ChartFrame v-else :height="168">
      <BarChart
        :data
        :height="168"
        :categories
        :y-axis="['count']"
        :radius="3"
        :bar-padding="0.45"
        :y-grid-line="true"
        :y-num-ticks="4"
        :x-formatter
        :x-num-ticks="3"
        :hide-legend="true"
      >
        <template #tooltip="{ values }">
          <ChartTooltip :title="values?.bucket">
            <div class="flex items-center justify-between gap-4">
              <span class="text-[11px] text-muted">Runs</span>
              <span class="text-[11px] font-medium text-highlighted tabular-nums">{{ (values?.count ?? 0).toLocaleString() }}</span>
            </div>
          </ChartTooltip>
        </template>
      </BarChart>
    </ChartFrame>
  </PanelCard>
</template>
