<script setup lang="ts">
const props = defineProps<{
  /** Whether the 5s poll is currently firing (user toggle + tab visible). */
  live: boolean
  /** Newest event timestamp in the current filter — `null` when there is no data. */
  lastEventAt: string | null
}>()

const emit = defineEmits<{ toggle: [] }>()

// Ticks every second so "12s ago" stays honest between polls.
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

const lastEventLabel = computed(() => {
  if (!props.lastEventAt) return null
  const seconds = Math.max(0, Math.floor((now.value - new Date(props.lastEventAt).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
})
</script>

<template>
  <div class="flex items-center gap-2 border border-default bg-elevated/40 py-1 pl-2.5 pr-1 text-xs">
    <span class="relative flex size-2">
      <span
        v-if="live"
        class="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60 motion-reduce:animate-none"
      />
      <span
        class="relative inline-flex size-2 rounded-full transition-colors duration-200"
        :class="live ? 'bg-success' : 'bg-neutral-500'"
      />
    </span>
    <span class="font-medium" :class="live ? 'text-success' : 'text-muted'">
      {{ live ? 'Live' : 'Paused' }}
    </span>
    <template v-if="lastEventLabel">
      <span aria-hidden="true" class="h-3 w-px bg-border" />
      <span class="text-muted tabular-nums">last event {{ lastEventLabel }}</span>
    </template>
    <UButton
      variant="ghost"
      color="neutral"
      size="xs"
      :icon="live ? 'i-nucleo-pause' : 'i-nucleo-play'"
      :aria-label="live ? 'Pause live refresh' : 'Resume live refresh'"
      @click="emit('toggle')"
    />
  </div>
</template>
