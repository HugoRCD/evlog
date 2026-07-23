<script setup lang="ts">
import type { BreakdownBarItem } from './BreakdownBars.vue'

const props = defineProps<{
  ci: CiStats
}>()

const total = computed(() => props.ci.ci + props.ci.local)

/** 0–1 share of CI runs — drives the split gauge. */
const ciShare = computed(() => (total.value > 0 ? props.ci.ci / total.value : 0))

const providerItems = computed<BreakdownBarItem[]>(() => props.ci.providers.map(p => ({
  key: p.provider,
  label: providerLabel(p.provider),
  icon: providerIcon(p.provider),
  count: p.count,
})))
</script>

<template>
  <UCard :ui="{ header: 'py-4 px-4', body: 'px-4 py-3' }">
    <template #header>
      <h3 class="flex items-center gap-2 text-lg font-normal text-highlighted">
        <UIcon name="i-nucleo-connect" class="size-5" />
        CI vs local
      </h3>
    </template>

    <div v-if="total === 0" class="py-6 text-center text-sm text-muted">
      No data yet for this range.
    </div>

    <template v-else>
      <div class="pb-3 pt-1">
        <div class="mb-1.5 flex items-center justify-between text-xs text-muted tabular-nums">
          <span class="flex items-center gap-1.5">
            <UIcon name="i-nucleo-server" class="size-3" />
            CI · {{ ci.ci.toLocaleString() }}
          </span>
          <span class="flex items-center gap-1.5">
            local · {{ ci.local.toLocaleString() }}
            <UIcon name="i-nucleo-terminal" class="size-3" />
          </span>
        </div>
        <div class="relative h-1.5 w-full overflow-hidden bg-elevated">
          <div
            class="breakdown-bar absolute inset-y-0 left-0 w-full bg-primary/70"
            :style="{ transform: `scaleX(${ciShare})` }"
          />
        </div>
      </div>

      <BreakdownBars
        v-if="providerItems.length > 0"
        :items="providerItems"
        empty-label="No CI provider detected."
      />
    </template>
  </UCard>
</template>
