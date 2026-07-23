<script setup lang="ts">
const props = defineProps<{
  /** Newest-first runs — the feed renders the first `MAX_ITEMS`. */
  runs: RunRow[]
}>()

const emit = defineEmits<{ rowClick: [run: RunRow] }>()

const MAX_ITEMS = 8

const visible = computed(() => props.runs.slice(0, MAX_ITEMS))

// Rows that arrived on the latest poll flash then fade (`.live-flash`).
const { isFresh } = useFreshIds(visible)

// Ticks with each poll (visible changes) — good enough resolution for a feed.
function timeAgo(iso: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 5) return 'now'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}
</script>

<template>
  <UCard :ui="{ header: 'py-4 px-4', body: 'p-0 sm:p-0' }">
    <template #header>
      <h3 class="flex items-center gap-2 text-lg font-normal text-highlighted">
        <UIcon name="i-nucleo-bolt" class="size-5" />
        Live feed
      </h3>
    </template>

    <div v-if="visible.length === 0" class="py-6 text-center text-sm text-muted">
      Waiting for events…
    </div>

    <TransitionGroup
      v-else
      tag="div"
      name="feed"
      class="relative flex flex-col divide-y divide-default/60"
    >
      <button
        v-for="run in visible"
        :key="run.id"
        type="button"
        class="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors duration-150 hover:bg-elevated/50"
        :class="{ 'live-flash-fresh': isFresh(run.id) }"
        @click="emit('rowClick', run)"
      >
        <span
          class="size-1.5 shrink-0 rounded-full"
          :class="run.outcome === 'success' ? 'bg-success' : 'bg-error'"
        />
        <code class="min-w-0 flex-1 truncate text-xs text-highlighted">{{ run.command }}</code>
        <span class="hidden shrink-0 text-[10px] uppercase tracking-wide text-dimmed sm:inline">{{ run.environment }}</span>
        <span class="shrink-0 text-xs text-muted tabular-nums">{{ run.durationMs }}ms</span>
        <span class="w-8 shrink-0 text-right text-xs text-dimmed tabular-nums">{{ timeAgo(run.timestamp) }}</span>
      </button>
    </TransitionGroup>
  </UCard>
</template>
