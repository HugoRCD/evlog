<script setup lang="ts">
/**
 * One block of the run detail drawer. Sections are separated by the paired
 * divider rather than a single hairline — over a long scrolling panel, the
 * dark-then-light step is what makes each block read as its own plane instead
 * of as rows in one continuous sheet.
 */
withDefaults(defineProps<{
  title: string
  /** The last section closes the stack, so it carries no divider. */
  divided?: boolean
}>(), {
  divided: true,
})
</script>

<template>
  <section class="px-5 py-4" :class="divided ? 'divider-y' : ''">
    <h4 class="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-dimmed">
      {{ title }}
    </h4>
    <slot />
  </section>
</template>
