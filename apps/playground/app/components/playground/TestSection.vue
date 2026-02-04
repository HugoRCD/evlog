<script setup lang="ts">
defineProps<{
  id?: string
  title: string
  description: string
}>()
</script>

<template>
  <section :id="id" class="space-y-6">
    <div class="space-y-2">
      <h2 class="text-2xl font-bold text-highlighted">
        {{ title }}
      </h2>
      <p class="text-muted leading-relaxed">
        {{ description }}
      </p>
    </div>
    <slot />
  </section>
</template>
