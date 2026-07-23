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
  /** Tailwind class for the bar fill. Default: brand primary at low opacity. */
  barClass?: string
  emptyLabel?: string
}>(), {
  barClass: 'bg-primary/15',
  emptyLabel: 'No data yet for this range.',
})

const total = computed(() => props.items.reduce((sum, item) => sum + item.count, 0))

function shareOf(count: number) {
  return total.value > 0 ? count / total.value : 0
}
</script>

<template>
  <div v-if="items.length === 0" class="py-6 text-center text-sm text-muted">
    {{ emptyLabel }}
  </div>

  <div v-else class="flex flex-col gap-1">
    <div
      v-for="item in items"
      :key="item.key"
      class="group relative overflow-hidden px-2.5 py-1.5"
    >
      <div
        class="breakdown-bar absolute inset-y-0 left-0 w-full"
        :class="barClass"
        :style="{ transform: `scaleX(${shareOf(item.count)})` }"
      />
      <div class="relative flex items-center justify-between gap-2 text-sm">
        <span class="flex min-w-0 items-center gap-2">
          <UIcon v-if="item.icon" :name="item.icon" class="size-3.5 shrink-0 text-muted" />
          <span class="truncate">{{ item.label }}</span>
          <span v-if="item.hint" class="hidden truncate text-xs text-dimmed sm:inline">{{ item.hint }}</span>
        </span>
        <span class="shrink-0 text-xs text-muted tabular-nums">
          {{ item.count.toLocaleString() }} · {{ Math.round(shareOf(item.count) * 100) }}%
        </span>
      </div>
    </div>
  </div>
</template>
