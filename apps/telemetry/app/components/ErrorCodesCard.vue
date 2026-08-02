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
  count: e.count,
  hint: lastSeenLabel(e.lastSeen),
})))
</script>

<template>
  <PanelCard title="Error codes" subtitle="What failed most, and when it last happened" flush>
    <EmptyState
      v-if="items.length === 0"
      message="No errors in this range."
      hint="Every run in the window succeeded."
    />

    <BreakdownBars v-else :items bar-class="bg-error/[0.045]" />
  </PanelCard>
</template>
