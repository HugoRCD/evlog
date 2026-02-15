<script setup lang="ts">
defineProps<{
  id?: string
  title: string
  description: string
}>()
</script>

<template>
  <section :id class="space-y-4">
    <div class="space-y-1">
      <h2 class="text-xl font-bold text-highlighted">
        {{ title }}
      </h2>
      <p class="text-sm text-muted leading-relaxed">
        {{ description }}
      </p>
    </div>
    <slot />
  </section>
</template>
