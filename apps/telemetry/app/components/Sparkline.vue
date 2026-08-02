<script setup lang="ts">
/**
 * The trend strip inside a `StatCard`. Hand-rolled SVG rather than a chart
 * component: at 28px tall with no axes, ticks, tooltip or legend, every
 * feature a chart library brings is one that has to be turned back off, and
 * six of these render on first paint.
 */
const props = withDefaults(defineProps<{
  values: number[]
  /** Stroke colour — a `--chart-*` token. Defaults to the accent, which is what every KPI card uses. */
  color?: string
}>(), {
  color: 'var(--chart-accent)',
})

/** Fixed viewBox, stretched to the card's width by `preserveAspectRatio="none"`. */
const WIDTH = 100
const HEIGHT = 28
/** Keeps the stroke from being clipped at the extremes. */
const PADDING = 2

const points = computed(() => {
  const { values } = props
  if (values.length < 2) return []

  const max = Math.max(...values)
  const min = Math.min(...values)
  // A flat series has no range to scale against — draw it down the middle
  // rather than pinning it to the top or bottom of the box.
  const span = max - min || 1
  const usable = HEIGHT - PADDING * 2

  return values.map((value, index) => ({
    x: (index / (values.length - 1)) * WIDTH,
    y: max === min ? HEIGHT / 2 : PADDING + usable - ((value - min) / span) * usable,
  }))
})

const line = computed(() => points.value.map(p => `${p.x},${p.y}`).join(' '))

/** Same path closed along the baseline, for the gradient fill under the line. */
const area = computed(() => {
  if (points.value.length === 0) return ''
  return `M0,${HEIGHT} L${line.value.split(' ').join(' L')} L${WIDTH},${HEIGHT} Z`
})

/** The endpoint carries the value the card states above it, so it gets a mark. */
const last = computed(() => points.value.at(-1))

const gradientId = useId()
</script>

<template>
  <!-- Held open even with nothing to draw: the card's bottom row must not
       change height between a range with one bucket and a range with thirty. -->
  <span v-if="points.length === 0" class="block h-7" aria-hidden="true" />

  <svg
    v-if="points.length > 0"
    :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
    preserveAspectRatio="none"
    class="h-7 w-full"
    aria-hidden="true"
  >
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="color" stop-opacity="0.16" />
        <stop offset="60%" :stop-color="color" stop-opacity="0.03" />
        <stop offset="100%" :stop-color="color" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path :d="area" :fill="`url(#${gradientId})`" />
    <circle
      v-if="last"
      :cx="last.x"
      :cy="last.y"
      r="1.6"
      :fill="color"
      vector-effect="non-scaling-stroke"
    />
    <polyline
      :points="line"
      fill="none"
      :stroke="color"
      stroke-width="1.25"
      stroke-linecap="round"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>
