<script setup lang="ts">
/**
 * The floating `?` and the sheet it opens.
 *
 * Shortcuts nobody can find are shortcuts nobody uses, and a dashboard has no
 * menu bar to hide them behind. The affordance is deliberately the one every
 * app that has shortcuts uses — a small `?` in the corner, and `?` on the
 * keyboard — so it needs no explaining.
 *
 * The list is declared in `useDashboardShortcuts`, next to the handlers it
 * describes, so a shortcut cannot be rebound without its own documentation
 * moving with it.
 */
defineProps<{
  groups: ShortcutGroup[]
}>()

const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <!-- Bottom-right, above everything, and out of the way of the run drawer
       that slides in from the same side. -->
  <!-- The glyph is the character, not an icon: the Nucleo set has no question
       mark, and a `?` button that shows an `i` would be a worse answer than
       adding an asset nobody can regenerate. -->
  <button
    type="button"
    aria-label="Keyboard shortcuts"
    title="Keyboard shortcuts (?)"
    class="surface-raised fixed bottom-4 right-4 z-40 flex size-9 items-center justify-center rounded-full bg-elevated/90 text-[13px] font-medium text-muted backdrop-blur-sm transition-colors duration-[--duration-fast] hover:bg-elevated hover:text-highlighted"
    @click="open = true"
  >
    ?
  </button>

  <UModal v-model:open="open" title="Keyboard shortcuts" :ui="{ content: 'max-w-lg' }">
    <template #body>
      <div class="flex flex-col gap-5">
        <section v-for="group in groups" :key="group.label" class="flex flex-col gap-1.5">
          <h3 class="text-[10px] uppercase tracking-wide text-dimmed">
            {{ group.label }}
          </h3>

          <div
            v-for="shortcut in group.shortcuts"
            :key="shortcut.label"
            class="flex items-center justify-between gap-4 py-0.5 text-[13px]"
          >
            <span class="min-w-0 truncate text-toned">{{ shortcut.label }}</span>
            <span class="flex shrink-0 items-center gap-1">
              <UKbd v-for="key in shortcut.keys" :key :value="key" size="sm" />
            </span>
          </div>
        </section>

        <p class="text-[11px] leading-4 text-dimmed">
          Shortcuts are off while you are typing in a field.
        </p>
      </div>
    </template>
  </UModal>
</template>
