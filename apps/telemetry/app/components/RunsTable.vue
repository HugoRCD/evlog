<script setup lang="ts">
import type { TableColumn, TableRow } from '@nuxt/ui'

const props = defineProps<{
  runs: RunRow[]
  loading: boolean
  sort: RunSortKey
  order: SortOrder
}>()

const emit = defineEmits<{
  sortChange: [{ sort: RunSortKey, order: SortOrder }]
  rowClick: [RunRow]
}>()

const SORTABLE_COLUMNS: { key: RunSortKey, label: string }[] = [
  { key: 'timestamp', label: 'Time' },
  { key: 'tool', label: 'Tool' },
  { key: 'command', label: 'Command' },
  { key: 'environment', label: 'Environment' },
  { key: 'outcome', label: 'Outcome' },
  { key: 'durationMs', label: 'Duration' },
  { key: 'machineId', label: 'Machine' },
]

const columns: TableColumn<RunRow>[] = SORTABLE_COLUMNS.map(({ key }) => ({ accessorKey: key, header: key }))

const data = computed(() => props.runs)

// Rows that arrived on a live poll flash then fade (`.live-flash`), same
// pattern as the live feed so "new data" reads identically everywhere.
const { isFresh } = useFreshIds(data)

const tableMeta = {
  class: {
    tr: (row: TableRow<RunRow>) => isFresh(row.original.id) ? 'live-flash-fresh' : '',
  },
}

function getRowId(row: RunRow) {
  return String(row.id)
}

/** Cycles a clicked column through desc → asc; switching column always starts at desc (newest/highest first). */
function toggleSort(key: RunSortKey) {
  const order: SortOrder = props.sort === key && props.order === 'desc' ? 'asc' : 'desc'
  emit('sortChange', { sort: key, order })
}

function sortIcon(key: RunSortKey) {
  if (props.sort !== key) return 'i-nucleo-chevrons-expand'
  return props.order === 'asc' ? 'i-nucleo-chevron-up' : 'i-nucleo-chevron-down'
}

function handleSelect(_e: Event, row: TableRow<RunRow>) {
  emit('rowClick', row.original)
}

function formatTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function shortMachineId(id: string | null) {
  return id ? id.slice(0, 8) : '—'
}
</script>

<template>
  <UCard :ui="{ header: 'py-4 px-4', body: 'p-0 sm:p-0' }">
    <template #header>
      <h3 class="text-lg font-normal text-highlighted">
        Recent runs
      </h3>
    </template>

    <UTable
      :data
      :columns
      :loading
      :get-row-id
      :meta="tableMeta"
      :ui="{ tr: 'cursor-pointer transition-colors duration-150', th: 'px-4 py-2.5 text-xs', td: 'px-4 py-2 text-sm' }"
      empty="No runs recorded yet."
      @select="handleSelect"
    >
      <template v-for="col in SORTABLE_COLUMNS" :key="col.key" #[`${col.key}-header`]>
        <button
          type="button"
          class="flex items-center gap-1 text-xs font-medium text-highlighted hover:text-primary"
          @click.stop="toggleSort(col.key)"
        >
          {{ col.label }}
          <UIcon :name="sortIcon(col.key)" class="size-3.5" />
        </button>
      </template>

      <template #timestamp-cell="{ row }">
        <span class="text-muted">{{ formatTime(row.original.timestamp) }}</span>
      </template>
      <template #command-cell="{ row }">
        <span class="font-mono text-xs">{{ row.original.command }}</span>
      </template>
      <template #environment-cell="{ row }">
        <UBadge variant="subtle" color="neutral" size="sm" class="capitalize">
          {{ row.original.environment }}
        </UBadge>
      </template>
      <template #outcome-cell="{ row }">
        <UBadge
          size="sm"
          :color="row.original.outcome === 'success' ? 'success' : 'error'"
          variant="subtle"
        >
          {{ row.original.outcome }}
          <span v-if="row.original.errorCode" class="ml-1 opacity-70">({{ row.original.errorCode }})</span>
        </UBadge>
      </template>
      <template #durationMs-cell="{ row }">
        <span class="text-muted tabular-nums">{{ row.original.durationMs }}ms</span>
      </template>
      <template #machineId-cell="{ row }">
        <span class="font-mono text-xs text-muted">{{ shortMachineId(row.original.machineId) }}</span>
      </template>
    </UTable>
  </UCard>
</template>
