<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

const props = defineProps<{
  commands: CommandStat[]
}>()

const columns: TableColumn<CommandStat>[] = [
  { accessorKey: 'command', header: 'Command' },
  { accessorKey: 'count', header: 'Runs' },
  { accessorKey: 'successRate', header: 'Success' },
  { accessorKey: 'avgDurationMs', header: 'Avg duration' },
]

const data = computed(() => props.commands)
</script>

<template>
  <UCard :ui="{ header: 'py-4 px-4', body: 'p-0 sm:p-0' }">
    <template #header>
      <h3 class="flex items-center gap-2 text-lg font-normal text-highlighted">
        <UIcon name="i-nucleo-tasks" class="size-5" />
        Top commands
      </h3>
    </template>

    <UTable
      :data
      :columns
      empty="No commands recorded yet."
      :ui="{ th: 'px-4 py-2.5 text-xs', td: 'px-4 py-2 text-sm' }"
    >
      <template #successRate-cell="{ row }">
        <span class="font-medium" :class="row.original.successRate >= 0.9 ? 'text-success' : 'text-warning'">
          {{ Math.round(row.original.successRate * 100) }}%
        </span>
      </template>
      <template #avgDurationMs-cell="{ row }">
        <span class="text-muted">{{ row.original.avgDurationMs }}ms</span>
      </template>
    </UTable>
  </UCard>
</template>
