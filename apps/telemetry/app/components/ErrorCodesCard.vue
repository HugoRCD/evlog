<script setup lang="ts">
import type { BreakdownBarItem } from './BreakdownBars.vue'

const props = defineProps<{
  errorCodes: ErrorCodeStat[]
}>()

function lastSeenLabel(iso: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

const items = computed<BreakdownBarItem[]>(() => props.errorCodes.map(e => ({
  key: e.errorCode,
  label: e.errorCode,
  icon: 'i-nucleo-circle-warning',
  count: e.count,
  hint: `last ${lastSeenLabel(e.lastSeen)}`,
})))
</script>

<template>
  <UCard :ui="{ header: 'py-4 px-4', body: 'px-4 py-3' }">
    <template #header>
      <h3 class="flex items-center gap-2 text-lg font-normal text-highlighted">
        <UIcon name="i-nucleo-bug" class="size-5" />
        Error codes
      </h3>
    </template>

    <div v-if="items.length === 0" class="flex flex-col items-center gap-2 py-6 text-sm text-muted">
      <UIcon name="i-nucleo-circle-check" class="size-5 text-success/70" />
      No errors in this range.
    </div>

    <BreakdownBars v-else :items bar-class="bg-error/12" />
  </UCard>
</template>
