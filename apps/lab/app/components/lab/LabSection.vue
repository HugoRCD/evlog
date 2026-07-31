<script setup lang="ts">
/**
 * A collapsible group of controls.
 *
 * Its open state is remembered per section. A panel this dense is only workable
 * if it can be pared down to the few groups you are actually using, and having
 * to pare it down again on every reload is worse than not being able to at all.
 */

const props = withDefaults(defineProps<{ title: string, open?: boolean }>(), { open: true })

const storageKey = computed(() => `render-labs:section:${props.title}`)
const expanded = ref(props.open)

onMounted(() => {
  const stored = localStorage.getItem(storageKey.value)
  if (stored !== null) expanded.value = stored === '1'
})

function toggle() {
  expanded.value = !expanded.value
  try {
    localStorage.setItem(storageKey.value, expanded.value ? '1' : '0')
  } catch {
    // A layout preference is not worth surfacing an error for.
  }
}
</script>

<template>
  <section class="border-b border-zinc-900">
    <button
      type="button"
      class="group flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-zinc-900/50 @min-[280px]:px-4"
      :aria-expanded="expanded"
      @click="toggle"
    >
      <span class="min-w-0 truncate font-pixel text-[10px] uppercase tracking-[0.18em] text-zinc-400 transition-colors group-hover:text-zinc-200">
        {{ title }}
      </span>
      <UIcon
        name="i-lucide-chevron-down"
        class="size-3 text-zinc-600 transition-all duration-200 group-hover:text-zinc-400"
        :class="{ '-rotate-90': !expanded }"
      />
    </button>

    <!--
      Animated on grid rows rather than height: the content keeps its natural
      size, so the transition never has to guess it and never clips a section
      that grew since it was measured.
    -->
    <div
      class="grid transition-[grid-template-rows] duration-200 ease-out"
      :class="expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
    >
      <div class="overflow-hidden">
        <div class="px-3 pb-4 @min-[280px]:px-4">
          <slot />
        </div>
      </div>
    </div>
  </section>
</template>
