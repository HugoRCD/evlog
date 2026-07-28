<script setup lang="ts">
const props = withDefaults(defineProps<{ title: string, open?: boolean }>(), { open: true })
const expanded = ref(props.open)
</script>

<template>
  <section class="border-b border-zinc-900">
    <button
      type="button"
      class="flex w-full items-center justify-between px-4 py-3 text-left"
      @click="expanded = !expanded"
    >
      <span class="font-pixel text-[10px] uppercase tracking-[0.18em] text-zinc-300">{{ title }}</span>
      <UIcon
        name="i-lucide-chevron-down"
        class="size-3 text-zinc-600 transition-transform"
        :class="{ '-rotate-90': !expanded }"
      />
    </button>
    <div v-show="expanded" class="px-4 pb-4">
      <slot />
    </div>
  </section>
</template>
