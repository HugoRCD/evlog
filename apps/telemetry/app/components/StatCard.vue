<script setup lang="ts">
import NumberFlow, { type Format } from '@number-flow/vue'

withDefaults(defineProps<{
  label: string
  /** Numeric value — animated (odometer-style) on change via NumberFlow. */
  value: number
  icon: string
  /** Unit rendered after the digits (`%`, `ms`, …), animated along with them. */
  suffix?: string
  sublabel?: string
  /** NumberFlow format options (an `Intl.NumberFormat` subset), e.g. `{ notation: 'compact' }`. */
  format?: Format
}>(), {
  suffix: undefined,
  sublabel: undefined,
  format: undefined,
})
</script>

<template>
  <UCard :ui="{ body: 'p-4' }">
    <div class="flex min-w-0 items-start justify-between gap-2">
      <div class="flex min-w-0 flex-col gap-2">
        <p class="truncate text-[11px] font-medium uppercase tracking-wider text-muted">
          {{ label }}
        </p>
        <p class="text-2xl font-bold tracking-tight text-highlighted tabular-nums xl:text-3xl">
          <NumberFlow :value :suffix :format />
        </p>
        <p v-if="sublabel" class="text-xs text-muted">
          {{ sublabel }}
        </p>
      </div>
      <GlassIconTile :icon size="md" />
    </div>
  </UCard>
</template>
