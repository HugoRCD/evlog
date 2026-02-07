<script setup lang="ts">
import type { TestSection } from '~/config/tests.config'

const props = defineProps<{
  sections: TestSection[]
  activeSection: string
}>()

const emit = defineEmits<{
  select: [sectionId: string]
}>()

function selectSection(sectionId: string) {
  emit('select', sectionId)
}
</script>

<template>
  <div class="flex gap-2 overflow-x-auto pb-2 -mb-2">
    <button
      v-for="section in sections"
      :key="section.id"
      :class="[
        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
        activeSection === section.id
          ? 'bg-primary text-primary-foreground'
          : 'bg-elevated text-muted hover:bg-muted hover:text-highlighted',
      ]"
      @click="selectSection(section.id)"
    >
      <UIcon v-if="section.icon" :name="section.icon" class="size-4" />
      {{ section.label }}
    </button>
  </div>
</template>
