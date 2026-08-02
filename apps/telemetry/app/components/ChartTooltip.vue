<script setup lang="ts">
/**
 * The surface every chart tooltip is drawn on. Unovis's own chrome is
 * stripped to transparent in `main.css`, so this is the only thing giving a
 * tooltip its shape — defining it once keeps all seven charts identical.
 */
const props = withDefaults(defineProps<{
  /** The hovered bucket, rendered as the tooltip's heading. */
  title?: string
}>(), {
  title: undefined,
})

/**
 * Publishing the hovered bucket from here, rather than from a `pointermove`
 * listener on the plot, is what makes the shared cursor work at all.
 *
 * The listener version wrote to shared reactive state on every mouse move,
 * which re-rendered every chart on the page dozens of times a second — that
 * churn was what made tooltips flicker on the chart being hovered and stopped
 * them appearing on the others entirely.
 *
 * A tooltip only exists while its chart is hovered, and its title only changes
 * when the bucket does. Mounting is the hover, unmounting is the leave, and
 * updates arrive once per bucket instead of once per pixel.
 */
const cursor = useSyncedCursor()

watch(() => props.title, title => cursor.set(title ?? null), { immediate: true })

onUnmounted(() => cursor.clear())
</script>

<template>
  <div class="surface-floating min-w-[9rem] rounded-[--ui-radius] bg-elevated px-2.5 py-2">
    <p v-if="title" class="mb-1.5 text-[11px] font-medium text-highlighted">
      {{ title }}
    </p>
    <div class="flex flex-col gap-1">
      <slot />
    </div>
  </div>
</template>
