<script setup lang="ts">
import { testConfig } from '~/config/tests.config'

const sections = testConfig.sections
const activeSection = ref(sections[0]?.id)

const currentSection = computed(() =>
  sections.find(s => s.id === activeSection.value),
)
</script>

<template>
  <div class="flex h-dvh bg-default">
    <aside class="w-60 shrink-0 border-r border-primary/10 overflow-y-auto bg-elevated/50">
      <header class="px-4 py-4 border-b border-primary/10">
        <h1 class="text-lg font-bold text-highlighted">
          evlog Playground
        </h1>
        <p class="text-muted text-xs mt-0.5">
          Test logging & wide events
        </p>
      </header>
      <nav class="p-2 space-y-0.5">
        <button
          v-for="section in sections"
          :key="section.id"
          :class="[
            'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left',
            activeSection === section.id
              ? 'bg-primary/10 text-highlighted font-medium'
              : 'text-muted hover:bg-elevated hover:text-highlighted',
          ]"
          @click="activeSection = section.id"
        >
          <UIcon v-if="section.icon" :name="section.icon" class="size-4 shrink-0" />
          {{ section.label }}
        </button>
      </nav>
    </aside>

    <main class="flex-1 overflow-y-auto p-6">
      <PlaygroundTestSection
        v-if="currentSection"
        :id="currentSection.id"
        :title="currentSection.title"
        :description="currentSection.description"
      >
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <PlaygroundTestCard
            v-for="test in currentSection.tests"
            :key="test.id"
            v-bind="test"
          />
        </div>
      </PlaygroundTestSection>
    </main>
  </div>
</template>
