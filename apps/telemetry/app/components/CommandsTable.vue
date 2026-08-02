<script setup lang="ts">
const props = defineProps<{
  commands: CommandStat[]
}>()

const max = computed(() => Math.max(0, ...props.commands.map(c => c.count)))

const rows = computed(() => props.commands)
</script>

<template>
  <PanelCard title="Top commands" subtitle="Busiest commands, with how often they fail and how slow they get" flush>
    <EmptyState
      v-if="rows.length === 0"
      message="No commands in this range."
      hint="Widen the time range, or clear a filter."
    />

    <div v-else class="flex flex-col">
      <div class="flex items-center gap-3 px-4 pb-1.5 text-[11px] text-dimmed">
        <span class="min-w-0 flex-1">Command</span>
        <span class="w-10 shrink-0" />
        <span class="w-14 text-right tabular-nums">Runs</span>
        <span class="w-14 text-right tabular-nums">Success</span>
        <span class="w-16 text-right tabular-nums">Avg</span>
        <span class="w-16 text-right tabular-nums">p95</span>
      </div>

      <div
        v-for="row in rows"
        :key="row.command"
        class="px-4 py-1.5"
      >
        <div class="flex items-center gap-3 text-[13px]">
          <span class="min-w-0 flex-1 truncate font-mono text-xs text-toned">{{ row.command }}</span>
          <ProportionBar :value="row.count" :max />
          <span class="w-14 text-right text-[11px] text-dimmed tabular-nums">{{ row.count.toLocaleString() }}</span>
          <span
            class="w-14 text-right text-[11px] tabular-nums"
            :class="row.successRate >= 0.99 ? 'text-dimmed' : row.successRate >= 0.9 ? 'text-muted' : 'text-error'"
          >{{ Math.round(row.successRate * 100) }}%</span>
          <span class="w-16 text-right text-[11px] text-dimmed tabular-nums">{{ formatDuration(row.avgDurationMs) }}</span>
          <span class="w-16 text-right text-[11px] text-muted tabular-nums">{{ formatDuration(row.p95DurationMs) }}</span>
        </div>
      </div>
    </div>
  </PanelCard>
</template>
