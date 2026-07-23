<script setup lang="ts">
const props = withDefaults(defineProps<{
  daily: DailyActivity[]
  /** When non-empty (24h range), the chart plots hours instead of days. */
  hourly?: HourlyActivity[]
}>(), {
  hourly: () => [],
})

interface DailyActivityPoint {
  day: string
  success: number
  errors: number
}

/** `BarChart` series — one per outcome, colored via `--chart-*` tokens
 * (`main.css`) so the bars stay full-saturation on light cards but darken off
 * their raw values in dark mode, where they'd otherwise read as "hyper brut"
 * against the dashboard's near-black background. */
const SERIES: { key: 'success' | 'errors', name: string, color: string }[] = [
  { key: 'success', name: 'Success', color: 'var(--chart-success-color)' },
  { key: 'errors', name: 'Error', color: 'var(--chart-error-color)' },
]

const categories: Record<string, BulletLegendItemInterface> = Object.fromEntries(
  SERIES.map(s => [s.key, { name: s.name, color: s.color }]),
)

const hourlyMode = computed(() => props.hourly.length > 0)

const data = computed<DailyActivityPoint[]>(() =>
  hourlyMode.value
    ? props.hourly.map(h => ({ day: formatHour(h.hour), success: h.success, errors: h.errors }))
    : props.daily.map(d => ({ day: formatDay(d.day), success: d.success, errors: d.errors })),
)

/** `BarChart` doesn't scale ticks by an `xAxis` data key — it plots bars at plain
 * numeric array indices and labels ticks with those same indices unless given an
 * explicit formatter. Map the tick back to the day it represents. */
function xFormatter(tick: number) {
  return data.value[Math.round(tick)]?.day ?? ''
}

/** Caps the number of x-axis ticks so ~30 daily bars don't crowd their labels. */
const xNumTicks = computed(() => Math.min(data.value.length, 8))

function formatDay(day: string) {
  const date = new Date(`${day}T00:00:00Z`)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatHour(hour: string) {
  const date = new Date(`${hour}:00Z`)
  return date.toLocaleTimeString(undefined, { hour: 'numeric' })
}

function formatValue(value: number) {
  return value.toLocaleString()
}
</script>

<template>
  <UCard :ui="{ header: 'py-4 px-4', body: 'p-0 sm:p-0' }">
    <template #header>
      <h3 class="flex items-center gap-2 text-lg font-normal text-highlighted">
        <GlassIconTile icon="i-nucleo-chart-line" />
        {{ hourlyMode ? 'Hourly activity' : 'Daily activity' }}
      </h3>
    </template>

    <div v-if="data.length === 0" class="py-6 text-center text-sm text-muted">
      No data yet for this range.
    </div>

    <div v-else class="relative min-h-[260px] overflow-hidden p-4">
      <div class="dot-pattern pointer-events-none -top-5 left-0 right-0 h-full" />

      <BarChart
        :data
        :height="220"
        :categories
        :y-axis="['success', 'errors']"
        :stacked="true"
        :radius="4"
        :bar-padding="0.25"
        :y-grid-line="true"
        :x-formatter
        :x-num-ticks
        :legend-position="LegendPosition.TopCenter"
      >
        <template #tooltip="{ values }">
          <div class="max-w-xs rounded-sm border border-default bg-elevated px-2 py-1 shadow-lg ring ring-default ring-offset-2 ring-offset-bg">
            <div v-if="values?.day" class="mb-2 text-sm font-semibold text-highlighted">
              {{ values.day }}
            </div>
            <div class="space-y-1.5">
              <div v-for="serie in SERIES" :key="serie.key" class="flex items-center justify-between gap-3">
                <div class="flex min-w-0 items-center gap-2">
                  <div class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: serie.color }" />
                  <span class="truncate text-sm text-muted">{{ serie.name }}</span>
                </div>
                <span class="shrink-0 text-sm font-semibold text-highlighted">{{ formatValue(values?.[serie.key] ?? 0) }}</span>
              </div>
            </div>
          </div>
        </template>
      </BarChart>
    </div>
  </UCard>
</template>
