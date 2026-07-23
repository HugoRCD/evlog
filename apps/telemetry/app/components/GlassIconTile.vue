<script setup lang="ts">
/**
 * Frame for the Nucleo "glass" display icons (`code-editor`, `chart-line`,
 * `bolt`, …) — they ship a single fixed graphite-to-charcoal gradient with no
 * `currentColor` hook, tuned to blend into the dashboard's near-black dark
 * mode. Floating bare on a light card they read as an unexplained dark blob
 * instead of a deliberate icon, so every glass icon gets its own elevated
 * tile: the surface (not the icon) is what adapts to the theme.
 */
withDefaults(defineProps<{
  icon: string
  /** Tile + icon scale. `sm` for card headers, `md` for stat cards. */
  size?: 'sm' | 'md'
}>(), {
  size: 'sm',
})
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-lg bg-elevated ring ring-default"
    :class="size === 'md' ? 'size-9 rounded-xl' : 'size-7'"
  >
    <UIcon :name="icon" :class="size === 'md' ? 'size-5' : 'size-4'" />
  </span>
</template>
