<script setup lang="ts">
const props = defineProps<{
  /** Newest-first runs — the feed renders the first `MAX_ITEMS`. */
  runs: RunRow[]
}>()

const emit = defineEmits<{ rowClick: [run: RunRow] }>()

const MAX_ITEMS = 8

const visible = computed(() => props.runs.slice(0, MAX_ITEMS))

// Rows that arrived on the latest poll flash then fade (`.live-flash-fresh`).
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
  <PanelCard title="Live feed" subtitle="Newest runs as they land" flush>
    <EmptyState
      v-if="visible.length === 0"
      message="Waiting for events…"
      hint="New runs appear here the moment they're ingested."
    />

    <TransitionGroup
      v-else
      tag="div"
      name="feed"
      class="relative flex flex-col"
    >
      <button
        v-for="run in visible"
        :key="run.id"
        type="button"
        class="flex w-full items-center gap-2.5 px-4 py-[7px] text-left transition-colors duration-[--duration-fast] hover:bg-elevated/60"
        :class="{ 'live-flash-fresh': isFresh(run.id) }"
        @click="emit('rowClick', run)"
      >
        <span
          class="size-1.5 shrink-0 rounded-full"
          :class="run.outcome === 'success' ? 'bg-success' : 'bg-error'"
        />
        <span class="min-w-0 flex-1 truncate font-mono text-xs text-toned">{{ run.command }}</span>
        <span class="hidden shrink-0 text-[11px] text-dimmed sm:inline">{{ run.environment }}</span>
        <span class="shrink-0 text-[11px] text-dimmed tabular-nums">{{ formatDuration(run.durationMs) }}</span>
        <span class="w-7 shrink-0 text-right text-[11px] text-dimmed tabular-nums">{{ timeAgo(run.timestamp) }}</span>
      </button>
    </TransitionGroup>
  </PanelCard>
</template>
