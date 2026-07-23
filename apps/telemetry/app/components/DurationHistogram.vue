<script setup lang="ts">
const props = defineProps<{
  durations: DurationStats
}>()

interface HistogramPoint {
  bucket: string
  count: number
}

const categories: Record<string, BulletLegendItemInterface> = {
  count: { name: 'Runs', color: 'var(--chart-primary-color)' },
}

const data = computed<HistogramPoint[]>(() => props.durations.histogram)

const empty = computed(() => data.value.every(b => b.count === 0))

/** `BarChart` plots bars at numeric indices — map ticks back to bucket labels. */
function xFormatter(tick: number) {
  return data.value[Math.round(tick)]?.bucket ?? ''
}
</script>

<template>
  <UCard :ui="{ header: 'py-4 px-4', body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <h3 class="flex items-center gap-2 text-lg font-normal text-highlighted">
          <GlassIconTile icon="i-nucleo-gauge" />
          Durations
        </h3>
        <div class="flex items-center gap-1.5">
          <UBadge variant="subtle" color="neutral" size="sm" class="tabular-nums">
            p50 {{ durations.p50.toLocaleString() }}ms
          </UBadge>
          <UBadge variant="subtle" color="primary" size="sm" class="tabular-nums">
            p95 {{ durations.p95.toLocaleString() }}ms
          </UBadge>
        </div>
      </div>
    </template>

    <div v-if="empty" class="py-6 text-center text-sm text-muted">
      No data yet for this range.
    </div>

    <div v-else class="relative min-h-[200px] overflow-hidden p-4">
      <div class="dot-pattern pointer-events-none -top-5 left-0 right-0 h-full" />

      <BarChart
        :data
        :height="170"
        :categories
        :y-axis="['count']"
        :radius="4"
        :bar-padding="0.25"
        :y-grid-line="true"
        :x-formatter
        :x-num-ticks="data.length"
        :hide-legend="true"
      >
        <template #tooltip="{ values }">
          <div class="max-w-xs rounded-sm border border-default bg-elevated px-2 py-1 shadow-lg ring ring-default ring-offset-2 ring-offset-bg">
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm text-muted">{{ values?.bucket }}</span>
              <span class="text-sm font-semibold text-highlighted tabular-nums">{{ (values?.count ?? 0).toLocaleString() }} runs</span>
            </div>
          </div>
        </template>
      </BarChart>
    </div>
  </UCard>
</template>
