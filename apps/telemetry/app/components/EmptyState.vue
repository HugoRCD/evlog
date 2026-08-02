<script setup lang="ts">
/**
 * "No data yet for this range" is a dead end. Every empty state on the
 * dashboard says what is missing and, where there is one, what to do about
 * it — so the panel stays useful instead of just blank.
 */
withDefaults(defineProps<{
  message: string
  /** What would bring data back — widening the range, clearing a filter. */
  hint?: string
}>(), {
  hint: undefined,
})
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-1 px-4 py-10 text-center">
    <p class="text-[13px] text-muted">
      {{ message }}
    </p>
    <p v-if="hint" class="text-xs text-dimmed">
      {{ hint }}
    </p>
  </div>
</template>
