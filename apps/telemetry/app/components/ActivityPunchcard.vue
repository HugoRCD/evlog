<script setup lang="ts">
/**
 * When people actually run the tool, as a weekday × hour grid. A plain CSS
 * grid rather than a chart component — 168 cells with no axes or tooltips is
 * markup, not a plot, and it stays crisp at any width.
 */
const props = defineProps<{
  cells: PunchcardCell[]
}>()

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
/** Hours labelled on the axis — every third one, so the labels never collide. */
const LABELLED_HOURS = new Set([0, 3, 6, 9, 12, 15, 18, 21])

const counts = computed(() => {
  const byCell = new Map<string, number>()
  for (const cell of props.cells) byCell.set(`${cell.weekday}-${cell.hour}`, cell.count)
  return byCell
})

const peak = computed(() => Math.max(0, ...props.cells.map(cell => cell.count)))

const total = computed(() => props.cells.reduce((sum, cell) => sum + cell.count, 0))

function countAt(weekday: number, hour: number) {
  return counts.value.get(`${weekday}-${hour}`) ?? 0
}

/**
 * Square-root scaling: run counts are heavily skewed toward a few peak hours,
 * and a linear ramp would wash every other cell out to the same near-empty
 * shade.
 */
function opacityAt(weekday: number, hour: number) {
  const count = countAt(weekday, hour)
  if (count === 0 || peak.value === 0) return 0
  return 0.08 + Math.sqrt(count / peak.value) * 0.72
}

/**
 * 168 cells is too many to give each a tooltip, and the native `title` popup
 * is both slow to appear and styled by the OS. The reading goes in the header
 * instead: one line that follows the pointer's cell, always in the same place.
 */
const hovered = ref<{ weekday: number, hour: number } | null>(null)

const readout = computed(() => {
  if (!hovered.value) return null
  const { weekday, hour } = hovered.value
  const count = countAt(weekday, hour)
  return `${WEEKDAYS[weekday - 1]} ${String(hour).padStart(2, '0')}:00 · ${count} run${count === 1 ? '' : 's'}`
})

function labelAt(weekday: number, hour: number) {
  const count = countAt(weekday, hour)
  return `${WEEKDAYS[weekday - 1]} ${String(hour).padStart(2, '0')}:00 UTC — ${count} run${count === 1 ? '' : 's'}`
}
</script>

<template>
  <PanelCard title="When runs happen" subtitle="Weekday by hour, in UTC">
    <template #actions>
      <span class="text-[11px] tabular-nums" :class="readout ? 'text-toned' : 'text-dimmed'">
        {{ readout ?? `peak ${peak}/h` }}
      </span>
    </template>

    <EmptyState
      v-if="total === 0"
      message="No runs in this range."
      hint="Widen the time range, or clear a filter."
    />

    <div v-else class="overflow-x-auto" @pointerleave="hovered = null">
      <div class="flex min-w-[420px] flex-col gap-[3px]">
        <div v-for="(day, index) in WEEKDAYS" :key="day" class="flex items-center gap-2">
          <span class="w-7 shrink-0 text-right text-[10px] text-dimmed">{{ day }}</span>
          <div class="flex flex-1 gap-[2px]">
            <div
              v-for="hour in HOURS"
              :key="hour"
              class="h-3.5 flex-1 rounded-[2px] bg-primary transition-opacity duration-[--duration-fast]"
              :style="{ opacity: opacityAt(index + 1, hour) }"
              :title="labelAt(index + 1, hour)"
              @pointerenter="hovered = { weekday: index + 1, hour }"
            />
          </div>
        </div>

        <div class="flex items-center gap-2 pt-0.5">
          <span class="w-7 shrink-0" />
          <div class="flex flex-1 gap-[2px]">
            <span
              v-for="hour in HOURS"
              :key="hour"
              class="flex-1 text-center text-[9px] tabular-nums text-dimmed"
            >
              {{ LABELLED_HOURS.has(hour) ? hour : '' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </PanelCard>
</template>
