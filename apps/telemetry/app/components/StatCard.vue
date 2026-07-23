<script setup lang="ts">
defineProps<{
  label: string
  value: string
  icon: string
  sublabel?: string
}>()
</script>

<template>
  <UCard :ui="{ body: 'p-5 sm:p-6' }">
    <div class="flex items-start justify-between gap-3">
      <div class="flex flex-col gap-1.5">
        <p class="text-xs font-medium uppercase tracking-wide text-muted">
          {{ label }}
        </p>
        <p class="text-3xl font-bold tracking-tight text-highlighted">
          {{ value }}
        </p>
        <p v-if="sublabel" class="text-xs text-muted">
          {{ sublabel }}
        </p>
      </div>
      <div class="flex size-9 shrink-0 items-center justify-center bg-elevated text-muted">
        <UIcon :name="icon" class="size-4" />
      </div>
    </div>
  </UCard>
</template>
