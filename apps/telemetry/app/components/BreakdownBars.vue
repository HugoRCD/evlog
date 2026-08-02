<script setup lang="ts">
export interface BreakdownBarItem {
  key: string
  label: string
  icon?: string
  count: number
  /** Optional trailing hint (e.g. "last seen 2m ago"). */
  hint?: string
}

const props = withDefaults(defineProps<{
  items: BreakdownBarItem[]
  /** Gauge fill. Defaults to the chart accent; error lists pass their own hue. */
  barColor?: string
}>(), {
  barColor: 'var(--chart-accent)',
})

const total = computed(() => props.items.reduce((sum, item) => sum + item.count, 0))
const max = computed(() => Math.max(0, ...props.items.map(item => item.count)))

function shareOf(count: number) {
  return total.value > 0 ? Math.round((count / total.value) * 100) : 0
}
</script>

<template>
  <div class="flex flex-col">
    <div
      v-for="item in items"
      :key="item.key"
      class="flex items-center gap-3 px-4 py-1.5 text-[13px]"
    >
      <span class="flex min-w-0 flex-1 items-center gap-2">
        <UIcon v-if="item.icon" :name="item.icon" class="size-3.5 shrink-0 text-dimmed" />
        <span class="truncate text-toned">{{ item.label }}</span>
        <span v-if="item.hint" class="hidden truncate text-[11px] text-dimmed sm:inline">{{ item.hint }}</span>
      </span>

      <ProportionBar :value="item.count" :max :color="barColor" />

      <span class="w-20 shrink-0 text-right text-[11px] text-dimmed tabular-nums">
        {{ item.count.toLocaleString() }} · {{ shareOf(item.count) }}%
      </span>
    </div>
  </div>
</template>
