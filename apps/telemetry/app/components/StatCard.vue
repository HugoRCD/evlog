<script setup lang="ts">
import NumberFlow, { type Format } from '@number-flow/vue'

const props = withDefaults(defineProps<{
  label: string
  /** Numeric value — animated (odometer-style) on change via NumberFlow. */
  value: number
  /** Unit rendered after the digits (`%`, `ms`, …), animated along with them. */
  suffix?: string
  /** NumberFlow format options (an `Intl.NumberFormat` subset), e.g. `{ notation: 'compact' }`. */
  format?: Format
  /**
   * Change against the preceding window of equal length. A ratio (`0.12` =
   * +12%) unless `deltaUnit` says otherwise; `null` means there was no
   * baseline to compare against and the row is hidden.
   */
  delta?: number | null
  /** `points` for metrics that are already percentages — "+2pt", not "+2%". */
  deltaUnit?: 'percent' | 'points'
  /** Set on metrics where going down is the win (error rate, duration). */
  lowerIsBetter?: boolean
  /** Per-bucket values across the current range, drawn as a trend strip. */
  series?: number[]
}>(), {
  suffix: undefined,
  format: undefined,
  delta: undefined,
  deltaUnit: 'percent',
  lowerIsBetter: false,
  series: undefined,
})

/**
 * Below this the change is noise. A "+0.4%" rendered in colour is a false
 * signal, so small movements read as "stable" in plain text — which keeps
 * colour meaning something on the cards where it does appear.
 */
const NOISE_FLOOR = { percent: 0.02, points: 1 }

const hasDelta = computed(() => props.delta !== undefined && props.delta !== null && Number.isFinite(props.delta))

const significant = computed(() => Math.abs(props.delta ?? 0) >= NOISE_FLOOR[props.deltaUnit])

const rising = computed(() => (props.delta ?? 0) > 0)

const tone = computed(() => {
  if (!significant.value) return 'text-dimmed'
  return rising.value !== props.lowerIsBetter ? 'text-success' : 'text-error'
})

const deltaLabel = computed(() => {
  if (!significant.value) return 'Stable'

  const delta = props.delta ?? 0
  const sign = delta > 0 ? '+' : '−'
  const magnitude = Math.abs(delta)
  return props.deltaUnit === 'points'
    ? `${sign}${Math.round(magnitude)}pt`
    : `${sign}${Math.round(magnitude * 100)}%`
})

/**
 * Large counts are shown compact so the six-across grid never reflows the day
 * adoption takes off — the exact figure stays available on hover.
 */
const COMPACT_ABOVE = 100_000

const displayFormat = computed<Format | undefined>(() =>
  props.format ?? (props.value >= COMPACT_ABOVE ? { notation: 'compact', maximumFractionDigits: 1 } : undefined),
)

const exactValue = computed(() => `${props.value.toLocaleString()}${props.suffix ?? ''}`)
</script>

<template>
  <div class="surface-raised flex flex-col gap-3 rounded-[--radius-lg] bg-muted px-4 pb-3 pt-3.5">
    <p class="truncate text-xs font-medium leading-4 text-muted">
      {{ label }}
    </p>

    <div class="flex items-baseline gap-2">
      <p
        class="text-[26px] font-medium leading-none tracking-[-0.02em] text-highlighted tabular-nums"
        :title="exactValue"
      >
        <NumberFlow :value :suffix :format="displayFormat" />
      </p>
    </div>

    <div class="flex items-end gap-3" :class="hasDelta ? 'justify-between' : 'justify-end'">
      <p v-if="hasDelta" class="flex items-center gap-1 text-[11px] leading-4 tabular-nums" :class="tone">
        <UIcon
          v-if="significant"
          :name="rising ? 'i-nucleo-chevron-up' : 'i-nucleo-chevron-down'"
          class="size-2.5 shrink-0"
        />
        <span>{{ deltaLabel }}</span>
      </p>

      <Sparkline v-if="series && series.length > 1" :values="series" color="var(--chart-accent)" class="min-w-20 flex-1" />
    </div>
  </div>
</template>
