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
  /** Tailwind class for the bar fill. Default: the chart accent, well below the text. */
  barClass?: string
}>(), {
  barClass: 'bg-primary/10',
})

const total = computed(() => props.items.reduce((sum, item) => sum + item.count, 0))

function shareOf(count: number) {
  return total.value > 0 ? count / total.value : 0
}
</script>

<template>
  <div class="flex flex-col">
    <div
      v-for="item in items"
      :key="item.key"
      class="relative overflow-hidden px-4 py-1.5"
    >
      <div
        class="breakdown-bar absolute inset-y-0 left-0 w-full"
        :class="barClass"
        :style="{ transform: `scaleX(${shareOf(item.count)})` }"
      />
      <div class="relative flex items-center justify-between gap-3 text-[13px]">
        <span class="flex min-w-0 items-center gap-2">
          <UIcon v-if="item.icon" :name="item.icon" class="size-3.5 shrink-0 text-dimmed" />
          <span class="truncate text-toned">{{ item.label }}</span>
          <span v-if="item.hint" class="hidden truncate text-[11px] text-dimmed sm:inline">{{ item.hint }}</span>
        </span>
        <span class="shrink-0 text-[11px] text-dimmed tabular-nums">
          {{ item.count.toLocaleString() }} · {{ Math.round(shareOf(item.count) * 100) }}%
        </span>
      </div>
    </div>
  </div>
</template>
