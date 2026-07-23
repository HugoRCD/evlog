<script setup lang="ts">
import type { BreakdownBarItem } from './BreakdownBars.vue'

const props = defineProps<{
  agents: AgentCount[]
}>()

const total = computed(() => props.agents.reduce((sum, a) => sum + a.count, 0))

/** Share of runs driven by an AI agent (any non-null `env.agent`). */
const agentShare = computed(() => {
  if (total.value === 0) return 0
  const agentRuns = props.agents.filter(a => a.agent !== null).reduce((sum, a) => sum + a.count, 0)
  return Math.round((agentRuns / total.value) * 100)
})

const items = computed<BreakdownBarItem[]>(() => props.agents.map(a => ({
  key: a.agent ?? '__terminal__',
  label: agentLabel(a.agent),
  icon: agentIcon(a.agent),
  count: a.count,
})))
</script>

<template>
  <UCard :ui="{ header: 'py-4 px-4', body: 'px-4 py-3' }">
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <h3 class="flex items-center gap-2 text-lg font-normal text-highlighted">
          <GlassIconTile icon="i-nucleo-sparkle" />
          Agents
        </h3>
        <UBadge v-if="total > 0" variant="subtle" color="primary" size="sm" class="tabular-nums">
          {{ agentShare }}% via AI agents
        </UBadge>
      </div>
    </template>

    <BreakdownBars :items />
  </UCard>
</template>
