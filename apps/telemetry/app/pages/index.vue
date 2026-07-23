<script setup lang="ts">
useHead({ title: 'evlog telemetry' })

const { clear } = useUserSession()
const authRequired = useAuthRequired()
const route = useRoute()
const router = useRouter()

// Nuxt UI's <USelect> reserves the empty string for "cleared" — using it as a
// real option's value trips a Reka UI invariant, so use a sentinel instead.
const ALL = '__all__'

const VALID_RANGES: StatsRange[] = ['24h', '7d', '30d']
const VALID_SORTS: RunSortKey[] = ['timestamp', 'tool', 'command', 'environment', 'outcome', 'durationMs', 'machineId']
const PAGE_SIZE = 25

function queryString(key: string): string | undefined {
  const value = route.query[key]
  return typeof value === 'string' ? value : undefined
}

function queryNumber(key: string, fallback: number): number {
  const n = Number(queryString(key))
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback
}

// All filter/sort/pagination/detail state lives in the URL — shareable links,
// working back/forward, and a reload always reproduces the same view.
const range = ref<StatsRange>((VALID_RANGES as string[]).includes(queryString('range') ?? '') ? queryString('range') as StatsRange : '7d')
const tool = ref(queryString('tool') ?? ALL)
const environment = ref(queryString('environment') ?? ALL)
const sort = ref<RunSortKey>((VALID_SORTS as string[]).includes(queryString('sort') ?? '') ? queryString('sort') as RunSortKey : 'timestamp')
const order = ref<SortOrder>(queryString('order') === 'asc' ? 'asc' : 'desc')
const page = ref(queryNumber('page', 1))
const selectedRunId = ref<number | null>(queryNumber('run', 0) || null)

const urlQuery = computed(() => {
  const query: Record<string, string> = {}
  if (range.value !== '7d') query.range = range.value
  if (tool.value !== ALL) query.tool = tool.value
  if (environment.value !== ALL) query.environment = environment.value
  if (sort.value !== 'timestamp') query.sort = sort.value
  if (order.value !== 'desc') query.order = order.value
  if (page.value !== 1) query.page = String(page.value)
  if (selectedRunId.value) query.run = String(selectedRunId.value)
  return query
})

watch(urlQuery, query => router.replace({ query }), { flush: 'post' })

// Any filter/sort change invalidates the current page — jump back to page 1.
watch([range, tool, environment, sort, order], () => {
  page.value = 1
})

// Drives the "Reset filters" button — hidden when the view already matches
// the defaults, so it never appears as a no-op action.
const hasActiveFilters = computed(() =>
  range.value !== '7d'
  || tool.value !== ALL
  || environment.value !== ALL
  || sort.value !== 'timestamp'
  || order.value !== 'desc',
)

/** Resets filters and sort to their defaults; the watcher above takes care of resetting `page`. Leaves the open run detail untouched. */
function resetFilters() {
  range.value = '7d'
  tool.value = ALL
  environment.value = ALL
  sort.value = 'timestamp'
  order.value = 'desc'
}

const rangeOptions = [
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
]

const statsQuery = computed(() => ({
  range: range.value,
  tool: tool.value === ALL ? undefined : tool.value,
  environment: environment.value === ALL ? undefined : environment.value,
}))

const { data: stats } = await useFetch<StatsResponse>(
  '/api/telemetry/stats',
  { query: statsQuery, watch: [statsQuery] },
)

const toolOptions = computed(() => [
  { label: 'All tools', value: ALL },
  ...(stats.value?.tools.map(t => ({ label: t.tool, value: t.tool })) ?? []),
])
const environmentOptions = computed(() => [
  { label: 'All environments', value: ALL },
  ...(stats.value?.environments.map(e => ({ label: e.environment, value: e.environment })) ?? []),
])

const runsQuery = computed(() => ({
  range: range.value,
  tool: tool.value === ALL ? undefined : tool.value,
  environment: environment.value === ALL ? undefined : environment.value,
  sort: sort.value,
  order: order.value,
  page: page.value,
  pageSize: PAGE_SIZE,
}))

const { data: runsData, status: runsStatus } = await useFetch<RunsResponse>(
  '/api/telemetry/runs',
  { query: runsQuery, watch: [runsQuery] },
)

const runs = computed(() => runsData.value?.runs ?? [])
const runsTotal = computed(() => runsData.value?.total ?? 0)

function onSortChange({ sort: nextSort, order: nextOrder }: { sort: RunSortKey, order: SortOrder }) {
  sort.value = nextSort
  order.value = nextOrder
}

const detailOpen = ref(false)
const runDetail = ref<RunDetail | null>(null)
const runDetailLoading = ref(false)

async function openRunDetail(id: number) {
  selectedRunId.value = id
  detailOpen.value = true
  runDetailLoading.value = true
  runDetail.value = null
  try {
    runDetail.value = await $fetch<RunDetail>(`/api/telemetry/runs/${id}`)
  } catch {
    runDetail.value = null
  } finally {
    runDetailLoading.value = false
  }
}

function closeRunDetail() {
  detailOpen.value = false
  selectedRunId.value = null
}

// Deep-linked run (`?run=123`) — reopen the slide-over without blocking the
// page's own stats/runs fetch above.
if (selectedRunId.value) {
  openRunDetail(selectedRunId.value)
}

const totals = computed(() => stats.value?.totals ?? { total: 0, success: 0, errors: 0, machines: 0, avgDurationMs: 0 })

const successRate = computed(() => totals.value.total > 0 ? Math.round((totals.value.success / totals.value.total) * 100) : 0)
const errorRate = computed(() => totals.value.total > 0 ? Math.round((totals.value.errors / totals.value.total) * 100) : 0)

async function onLogout() {
  await $fetch('/api/logout', { method: 'POST' })
  await clear()
  await navigateTo('/login')
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-[1600px] flex-col gap-10 px-4 py-6 sm:px-8 lg:px-12 lg:py-10">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h1 class="flex items-center gap-2">
        <span class="relative flex items-center gap-0.5">
          <span class="font-pixel text-3xl font-normal">evlog</span>
          <span class="text-primary text-3xl">.</span>
          <span aria-hidden="true" class="absolute inset-0 flex items-center gap-0.5 blur-xs animate-pulse motion-reduce:animate-none">
            <span class="font-pixel text-3xl font-normal">evlog</span>
            <span class="text-primary text-3xl">.</span>
          </span>
        </span>
        <span aria-hidden="true" class="mx-1.5 h-7 w-px bg-border" />
        <span class="font-pixel text-[10px] uppercase tracking-widest text-muted">telemetry</span>
      </h1>

      <div class="flex flex-wrap items-center gap-2">
        <USelect v-model="range" :items="rangeOptions" value-key="value" class="w-40" />
        <USelect v-model="tool" :items="toolOptions" value-key="value" class="w-40" />
        <USelect v-model="environment" :items="environmentOptions" value-key="value" class="w-44" />
        <UButton v-if="hasActiveFilters" variant="ghost" color="neutral" icon="i-lucide-rotate-ccw" @click="resetFilters">
          Reset filters
        </UButton>
        <McpConnectButton />
        <UButton v-if="authRequired" variant="ghost" color="neutral" icon="i-lucide-log-out" @click="onLogout">
          Sign out
        </UButton>
      </div>
    </div>

    <div
      v-if="stats?.mock"
      class="flex items-center gap-2 border-l-2 border-amber-500/40 bg-elevated/30 px-3 py-2 text-xs text-muted"
    >
      <UIcon name="i-lucide-flask-conical" class="size-3.5 shrink-0 text-amber-500/60" />
      <p>
        Showing sample data — no runs recorded yet, these are generated events so you can explore the dashboard. It'll switch to real events automatically once the CLI starts posting.
      </p>
    </div>

    <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard label="Total runs" :value="totals.total.toLocaleString()" icon="i-lucide-terminal" />
      <StatCard label="Success rate" :value="`${successRate}%`" icon="i-lucide-check-circle-2" />
      <StatCard label="Error rate" :value="`${errorRate}%`" icon="i-lucide-alert-circle" />
      <StatCard label="Unique machines" :value="totals.machines.toLocaleString()" icon="i-lucide-monitor" />
      <StatCard label="Avg duration" :value="`${totals.avgDurationMs}ms`" icon="i-lucide-clock" />
    </div>

    <div class="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <div class="lg:col-span-2">
        <DailyActivityChart :daily="stats?.daily ?? []" />
      </div>
      <EnvironmentBreakdown :environments="stats?.environments ?? []" />
    </div>

    <CommandsTable :commands="stats?.commands ?? []" />

    <div class="flex flex-col gap-4">
      <RunsTable
        :runs
        :loading="runsStatus === 'pending'"
        :sort
        :order
        @sort-change="onSortChange"
        @row-click="run => openRunDetail(run.id)"
      />
      <UPagination
        v-if="runsTotal > PAGE_SIZE"
        v-model:page="page"
        :total="runsTotal"
        :items-per-page="PAGE_SIZE"
        class="self-center"
      />
    </div>

    <USlideover
      v-model:open="detailOpen"
      title="Run detail"
      :description="runDetail ? `${runDetail.tool} · ${runDetail.command}` : undefined"
      @update:open="(open: boolean) => { if (!open) closeRunDetail() }"
    >
      <template #body>
        <RunDetailPanel :run="runDetail" :loading="runDetailLoading" />
      </template>
    </USlideover>
  </div>
</template>
