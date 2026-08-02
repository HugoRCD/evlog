<script setup lang="ts">
/**
 * A reported key and its value, as one object. The two halves are split by an
 * inner hairline rather than by colour: a drawer can hold a dozen of these,
 * and tinting them turned the panel into a wall of blue.
 */
defineProps<{
  label: string
  value: string
}>()
</script>

<template>
  <span class="surface-raised inline-flex items-stretch overflow-hidden rounded-[--radius-sm] bg-elevated text-[11px]">
    <span class="px-1.5 py-0.5 text-dimmed">{{ label }}</span>
    <span class="border-l border-default px-1.5 py-0.5 font-mono text-toned">{{ value }}</span>
  </span>
</template>
