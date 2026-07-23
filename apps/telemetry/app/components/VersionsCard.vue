<script setup lang="ts">
import type { BreakdownBarItem } from './BreakdownBars.vue'

const props = defineProps<{
  nodeVersions: VersionCount[]
  toolVersions: VersionCount[]
  os: OsCount[]
}>()

const MAX_ROWS = 4

const nodeItems = computed<BreakdownBarItem[]>(() => props.nodeVersions.slice(0, MAX_ROWS).map(v => ({
  key: v.version,
  label: `Node ${v.version}`,
  icon: 'i-simple-icons-nodedotjs',
  count: v.count,
})))

const toolItems = computed<BreakdownBarItem[]>(() => props.toolVersions.slice(0, MAX_ROWS).map(v => ({
  key: v.version,
  label: `v${v.version.replace(/^v/, '')}`,
  icon: 'i-nucleo-box',
  count: v.count,
})))

const osItems = computed<BreakdownBarItem[]>(() => props.os.slice(0, MAX_ROWS).map(o => ({
  key: o.os ?? '__unknown__',
  label: osLabel(o.os),
  icon: osIcon(o.os),
  count: o.count,
})))

const sections = computed(() => [
  { title: 'Runtime', items: nodeItems.value },
  { title: 'CLI version', items: toolItems.value },
  { title: 'Platform', items: osItems.value },
])

const empty = computed(() => sections.value.every(s => s.items.length === 0))
</script>

<template>
  <UCard :ui="{ header: 'py-4 px-4', body: 'px-4 py-3' }">
    <template #header>
      <h3 class="flex items-center gap-2 text-lg font-normal text-highlighted">
        <GlassIconTile icon="i-nucleo-layers" />
        Versions & platforms
      </h3>
    </template>

    <div v-if="empty" class="py-6 text-center text-sm text-muted">
      No data yet for this range.
    </div>

    <div v-else class="flex flex-col gap-3">
      <section v-for="section in sections" :key="section.title">
        <h4 class="mb-1 text-[10px] font-medium uppercase tracking-widest text-dimmed">
          {{ section.title }}
        </h4>
        <BreakdownBars :items="section.items" empty-label="—" />
      </section>
    </div>
  </UCard>
</template>
