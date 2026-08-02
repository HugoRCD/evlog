<script setup lang="ts">
const props = defineProps<{
  machines: MachineActivityPoint[]
  granularity: TimelineGranularity
}>()

interface MachineBar {
  label: string
  returning: number
  fresh: number
}

/** Returning is the settled mass, new is the part worth noticing — so new gets the stronger step. */
const SERIES: { key: 'returning' | 'fresh', name: string, color: string }[] = [
  { key: 'returning', name: 'Returning', color: 'var(--chart-series-4)' },
  { key: 'fresh', name: 'New', color: 'var(--chart-accent)' },
]

const categories: Record<string, BulletLegendItemInterface> = Object.fromEntries(
  SERIES.map(s => [s.key, { name: s.name, color: s.color }]),
)

/** `new` is a subset of `active`, so the stack plots the remainder rather than double-counting. */
const data = computed<MachineBar[]>(() => props.machines.map(point => ({
  label: formatBucket(point.bucket, props.granularity),
  returning: point.active - point.new,
  fresh: point.new,
})))

const totalNew = computed(() => props.machines.reduce((sum, point) => sum + point.new, 0))

const empty = computed(() => props.machines.every(point => point.active === 0))

function xFormatter(tick: number) {
  return data.value[Math.round(tick)]?.label ?? ''
}

const xNumTicks = computed(() => bucketTickCount(data.value.length))

/** What this chart plots, in order — its half of the shared-cursor contract. */
const labels = computed(() => data.value.map(point => point.label))
</script>

<template>
  <PanelCard title="Active machines" subtitle="Distinct machines per bucket, split by whether we'd seen them before" flush>
    <template #actions>
      <span class="text-[11px] text-muted tabular-nums">{{ totalNew.toLocaleString() }} new</span>
    </template>

    <EmptyState
      v-if="empty"
      message="No machines in this range."
      hint="Runs from ephemeral CI have no stable machine id."
    />

    <ChartFrame v-else legend :labels :height="196">
      <BarChart
        :data
        :height="196"
        :categories
        :y-axis="['returning', 'fresh']"
        :stacked="true"
        :radius="3"
        :bar-padding="0.45"
        :y-grid-line="true"
        :y-num-ticks="4"
        :x-formatter
        :x-num-ticks
        :legend-position="LegendPosition.TopRight"
      >
        <template #tooltip="{ values }">
          <ChartTooltip :title="values?.label">
            <div v-for="serie in SERIES" :key="serie.key" class="flex items-center justify-between gap-4">
              <span class="flex min-w-0 items-center gap-1.5">
                <span class="size-1.5 shrink-0 rounded-full" :style="{ backgroundColor: serie.color }" />
                <span class="truncate text-[11px] text-muted">{{ serie.name }}</span>
              </span>
              <span class="shrink-0 text-[11px] font-medium text-highlighted tabular-nums">{{ values?.[serie.key] ?? 0 }}</span>
            </div>
          </ChartTooltip>
        </template>
      </BarChart>
    </ChartFrame>
  </PanelCard>
</template>
