<script setup lang="ts">
defineProps<{
  id?: string
  title: string
  description: string
}>()
</script>

<template>
  <section :id class="space-y-5">
    <div>
      <div class="flex items-center gap-2 mb-1.5">
        <div class="w-1 h-4 bg-primary" />
        <h2 class="text-lg font-semibold text-highlighted">
          {{ title }}
        </h2>
      </div>
      <p class="text-sm text-muted leading-relaxed">
        {{ description }}
      </p>
    </div>
    <slot />
  </section>
</template>
