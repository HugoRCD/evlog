<script setup lang="ts">
/**
 * Reserves a chart's box before the chart exists.
 *
 * Unovis needs a DOM to measure against, so `nuxt-charts` renders nothing at
 * all server-side — the panel ships with a collapsed body and the plot pops in
 * once hydration and the chart chunk have both landed. That reads as the
 * dashboard being slow even when the data arrived instantly.
 *
 * Holding the height open, and filling it with a resting baseline in the
 * meantime, makes the arrival a fade rather than a jump.
 *
 * Note what this component deliberately does *not* do: it never reads the
 * shared cursor. `ChartCursorRule` owns that subscription, so hovering a chart
 * cannot re-render the frame and, through it, the chart the pointer is in.
 */
const props = withDefaults(defineProps<{
  height: number
  /** Set when the chart draws a legend: it stacks above the plot and is part of the box to hold open. */
  legend?: boolean
  /**
   * Bucket labels in plot order. Supplying them opts the chart into the shared
   * cursor, so it shows a rule while another chart is hovered.
   */
  labels?: string[]
}>(), {
  legend: false,
  labels: undefined,
})

/** Measured against `LegendPosition.TopRight`'s rendered height at this type scale. */
const LEGEND_HEIGHT = 30

const reserved = computed(() => props.height + (props.legend ? LEGEND_HEIGHT : 0))
</script>

<template>
  <div class="relative px-2 pb-2">
    <div class="relative" :style="{ minHeight: `${reserved}px` }">
      <ChartCursorRule v-if="labels" :labels />

      <ClientOnly>
        <slot />

        <template #fallback>
          <div
            class="flex w-full items-end justify-stretch gap-1 px-2 pb-6 pt-4"
            :style="{ height: `${reserved}px` }"
            aria-hidden="true"
          >
            <div
              v-for="bar in 12"
              :key="bar"
              class="chart-skeleton flex-1 rounded-t-[3px] bg-elevated"
              :style="{ height: `${18 + ((bar * 37) % 55)}%`, animationDelay: `${bar * 40}ms` }"
            />
          </div>
        </template>
      </ClientOnly>
    </div>
  </div>
</template>
