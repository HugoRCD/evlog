<script setup lang="ts">
import { testConfig } from '~/config/tests.config'

const { sections } = testConfig
const activeSection = ref(sections[0]?.id)

const currentSection = computed(() =>
  sections.find(s => s.id === activeSection.value),
)
</script>

<template>
  <div class="flex h-dvh bg-default">
    <aside class="w-56 shrink-0 border-r border-[var(--ui-border)] overflow-y-auto">
      <div class="px-4 pt-5 pb-4">
        <h1 class="text-sm font-semibold text-highlighted tracking-tight">
          evlog
        </h1>
        <p class="text-[11px] text-muted mt-0.5">
          Playground
        </p>
      </div>
      <nav class="px-2 pb-3 space-y-px">
        <button
          v-for="section in sections"
          :key="section.id"
          :class="[
            'w-full flex items-center gap-2.5 px-3 py-2 text-[13px] transition-colors text-left',
            activeSection === section.id
              ? 'bg-primary/5 text-primary font-medium'
              : 'text-muted hover:text-highlighted',
          ]"
          @click="activeSection = section.id"
        >
          <UIcon v-if="section.icon" :name="section.icon" class="size-4 shrink-0" />
          <span class="flex-1 truncate">{{ section.label }}</span>
          <span class="text-[10px] tabular-nums opacity-40">{{ section.tests.length }}</span>
        </button>
      </nav>
    </aside>

    <main class="flex-1 overflow-y-auto p-8">
      <PlaygroundTestSection
        v-if="currentSection"
        :id="currentSection.id"
        :title="currentSection.title"
        :description="currentSection.description"
      >
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
