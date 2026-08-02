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
  /** Right-click shortcut: scope the whole dashboard to a value on this row. */
  filter: [{ field: 'tool' | 'environment', value: string }]
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

const toast = useToast()

/**
 * A row is a lead, not a destination: nine times out of ten you spot something
 * in the table and want the rest of the dashboard to follow it. Right-click
 * turns any value on the row into that filter without a trip to the toolbar.
 *
 * `UTable` gives no hook to wrap a `<tr>`, so rather than wrapping all seven
 * cells the menu is hoisted to the table and the row is resolved from where
 * the click landed. `<tbody>`'s child order matches `runs`, which is what
 * makes the index lookup safe.
 */
const menuRun = ref<RunRow | null>(null)

function onContextMenu(event: MouseEvent) {
  const row = (event.target as HTMLElement | null)?.closest('tr')
  const body = row?.parentElement
  if (!row || !body) return

  const index = Array.prototype.indexOf.call(body.children, row)
  menuRun.value = props.runs[index] ?? null
}

const menuItems = computed(() => menuRun.value ? rowMenu(menuRun.value) : [])

function rowMenu(run: RunRow) {
  return [
    [
      {
        label: 'Open run detail',
        icon: 'i-nucleo-chevrons-expand',
        onSelect: () => emit('rowClick', run),
      }
    ],
    [
      {
        label: `Filter to ${run.tool}`,
        icon: 'i-nucleo-box',
        onSelect: () => emit('filter', { field: 'tool', value: run.tool }),
      },
      {
        label: `Filter to ${run.environment}`,
        icon: 'i-nucleo-rocket',
        onSelect: () => emit('filter', { field: 'environment', value: run.environment }),
      },
    ],
    [
      {
        label: 'Copy command',
        icon: 'i-nucleo-copy',
        onSelect: () => copy(run.command, 'Command copied'),
      },
      {
        label: 'Copy run link',
        icon: 'i-nucleo-connect',
        onSelect: () => copy(`${window.location.origin}${window.location.pathname}?run=${run.id}`, 'Link copied'),
      },
    ],
  ]
}

async function copy(value: string, title: string) {
  await navigator.clipboard.writeText(value)
  toast.add({ title, icon: 'i-nucleo-check', duration: 1800 })
}
</script>

<template>
  <PanelCard title="Recent runs" subtitle="Every event in range — click a row for its full detail" flush>
    <UContextMenu :items="menuItems">
      <div @contextmenu="onContextMenu">
        <UTable
          :data
          :columns
          :loading
          :get-row-id
          :meta="tableMeta"
          :ui="{
            tr: 'cursor-pointer transition-colors duration-[--duration-fast] border-b-0',
            th: 'px-4 py-2 text-[11px] font-normal text-dimmed',
            td: 'px-4 py-1.5 text-[13px]',
            separator: 'bg-transparent',
          }"
          empty="No runs in this range."
          @select="handleSelect"
        >
          <template v-for="col in SORTABLE_COLUMNS" :key="col.key" #[`${col.key}-header`]>
            <button
              type="button"
              class="flex items-center gap-1 text-[11px] font-normal text-dimmed transition-colors duration-[--duration-fast] hover:text-toned"
              @click.stop="toggleSort(col.key)"
            >
              {{ col.label }}
              <UIcon :name="sortIcon(col.key)" class="size-3" />
            </button>
          </template>

          <template #timestamp-cell="{ row }">
            <span class="text-dimmed tabular-nums">{{ formatTime(row.original.timestamp) }}</span>
          </template>
          <template #tool-cell="{ row }">
            <span class="text-muted">{{ row.original.tool }}</span>
          </template>
          <template #command-cell="{ row }">
            <span class="font-mono text-xs text-toned">{{ row.original.command }}</span>
          </template>
          <template #environment-cell="{ row }">
            <span class="text-muted">{{ row.original.environment }}</span>
          </template>
          <template #outcome-cell="{ row }">
            <span class="flex items-center gap-1.5">
              <span
                class="size-1.5 shrink-0 rounded-full"
                :class="row.original.outcome === 'success' ? 'bg-success' : 'bg-error'"
              />
              <span class="text-muted">{{ row.original.outcome }}</span>
              <span v-if="row.original.errorCode" class="font-mono text-[11px] text-dimmed">{{ row.original.errorCode }}</span>
            </span>
          </template>
          <template #durationMs-cell="{ row }">
            <span class="text-muted tabular-nums">{{ formatDuration(row.original.durationMs) }}</span>
          </template>
          <template #machineId-cell="{ row }">
            <span class="font-mono text-[11px] text-dimmed">{{ shortMachineId(row.original.machineId) }}</span>
          </template>
        </UTable>
      </div>
    </UContextMenu>
  </PanelCard>
</template>
