<script setup lang="ts">
defineProps<{ label: string }>()
const model = defineModel<boolean>({ required: true })
</script>

<template>
  <button
    type="button"
    data-cuelume-toggle
    class="group flex w-full items-center justify-between gap-3 py-[3px] text-left"
    role="switch"
    :aria-checked="model"
    @click="model = !model"
  >
    <span class="font-mono text-[11px] leading-none text-dimmed group-hover:text-muted transition-colors truncate">
      {{ label }}
    </span>
    <span
      class="relative h-[18px] w-[34px] shrink-0 border transition-colors"
      :class="model ? 'border-primary-500/60 bg-primary-500/20' : 'border-muted bg-elevated/60'"
    >
      <span
        class="absolute top-[2px] block h-[12px] w-[12px] transition-all"
        :class="model ? 'left-[18px] bg-primary-500' : 'left-[2px] bg-accented'"
      />
    </span>
  </button>
</template>
