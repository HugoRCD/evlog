<script setup lang="ts">
defineProps<{ label: string }>()
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <button
    type="button"
    class="group flex w-full items-center justify-between gap-3 py-[3px] text-left"
    role="switch"
    :aria-checked="model"
    @click="model = !model"
  >
    <span class="font-mono text-[11px] leading-none text-zinc-500 group-hover:text-zinc-400 transition-colors truncate">
      {{ label }}
    </span>
    <span
      class="relative h-[18px] w-[34px] shrink-0 border transition-colors"
      :class="model ? 'border-blue-500/60 bg-blue-500/20' : 'border-zinc-800 bg-zinc-900/60'"
    >
      <span
        class="absolute top-[2px] block h-[12px] w-[12px] transition-all"
        :class="model ? 'left-[18px] bg-blue-400' : 'left-[2px] bg-zinc-600'"
      />
    </span>
  </button>
</template>
