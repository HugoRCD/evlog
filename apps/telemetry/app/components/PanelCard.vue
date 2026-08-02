<script setup lang="ts">
/**
 * The shell every panel on the dashboard sits in.
 *
 * It exists so the header treatment is defined once instead of fourteen
 * times: title, an optional line saying what the panel measures, and a slot
 * for whatever badge or control belongs on the right. Panel headers carry no
 * icon — icons are kept for places where they identify something (a CI
 * provider, an agent, a run's outcome) rather than decorate a heading.
 */
withDefaults(defineProps<{
  title: string
  /** One line on what this measures and how to read it. */
  subtitle?: string
  /** Removes the body padding, for panels whose content spans edge to edge (tables, lists). */
  flush?: boolean
}>(), {
  subtitle: undefined,
  flush: false,
})
</script>

<template>
  <section class="surface-raised flex flex-col overflow-hidden rounded-[--radius-lg] bg-muted">
    <header class="flex items-start justify-between gap-4 px-4 pb-3 pt-3.5">
      <div class="min-w-0">
        <h3 class="truncate text-[13px] font-medium leading-5 text-highlighted">
          {{ title }}
        </h3>
        <p v-if="subtitle" class="mt-0.5 text-xs leading-4 text-muted">
          {{ subtitle }}
        </p>
      </div>

      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-1.5">
        <slot name="actions" />
      </div>
    </header>

    <div class="flex-1" :class="flush ? '' : 'px-4 pb-4'">
      <slot />
    </div>
  </section>
</template>
