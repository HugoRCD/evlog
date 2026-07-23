// Explicit import (unlike the rest of `server/utils/`) because this module's
// pure functions are unit-tested directly with plain vitest, outside Nitro's
// auto-import context.
import { rangeToCutoff } from './query-filters'

interface WeightedOption {
  weight: number
}

const MOCK_TOOLS: (WeightedOption & { name: string, version: string })[] = [
  { name: 'evlog-cli', version: '0.4.2', weight: 0.88 },
  { name: 'my-other-tool', version: '1.2.0', weight: 0.12 },
]

const MOCK_ENVIRONMENTS: (WeightedOption & { name: string })[] = [
  { name: 'development', weight: 0.55 },
  { name: 'preview', weight: 0.18 },
  { name: 'production', weight: 0.22 },
  { name: 'ci', weight: 0.05 },
]

const MOCK_COMMANDS = ['doctor', 'telemetry status', 'telemetry enable', 'telemetry disable']
const MOCK_ERROR_CODES = ['ENOENT', 'ETIMEDOUT', 'CONFIG_INVALID']
const MOCK_MACHINE_IDS = Array.from({ length: 12 }, (_, i) => `mock-machine-${i.toString(16).padStart(4, '0')}`)
const MOCK_NODE_VERSIONS = ['v20.11.1', 'v22.4.0', 'v18.20.2']
const MOCK_PROVIDERS = [null, 'github_actions', 'vercel', 'netlify']
const MOCK_AGENTS = [null, 'cursor', 'claude-code', 'copilot']
const MOCK_RUN_COUNT = 420
const MOCK_DAYS_SPAN = 30
const MOCK_SEED = 42

/** Candidate flag keys — a run gets a random subset, mirroring real CLI usage. */
const MOCK_FLAG_POOL: { key: string, values: (boolean | number | string)[] }[] = [
  { key: 'verbose', values: [true, false] },
  { key: 'dryRun', values: [true, false] },
  { key: 'format', values: ['json', 'text', 'pretty'] },
]

/** Candidate custom fields — a run gets a random subset, mirroring `telemetry.set()` usage. */
const MOCK_CUSTOM_POOL: { key: string, values: (boolean | number | string)[] }[] = [
  { key: 'filesChanged', values: [1, 3, 7, 12, 28] },
  { key: 'cacheHit', values: [true, false] },
  { key: 'plan', values: ['free', 'pro', 'enterprise'] },
]

/** Deterministic PRNG (mulberry32) — same seed, same dataset, every process. */
function mulberry32(seed: number) {
  let a = seed
  return function random(): number {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function weightedPick<T extends WeightedOption>(rng: () => number, items: T[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0)
  let roll = rng() * total
  for (const item of items) {
    roll -= item.weight
    if (roll <= 0) return item
  }
  return items[items.length - 1]!
}

function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)]!
}

/** Picks a random subset (0-`pool.length`) of key/value pairs from a pool, deterministically. */
function pickFields(rng: () => number, pool: { key: string, values: (boolean | number | string)[] }[]): Record<string, boolean | number | string> {
  const fields: Record<string, boolean | number | string> = {}
  for (const { key, values } of pool) {
    if (rng() < 0.6) fields[key] = pick(rng, values)
  }
  return fields
}

let cachedRuns: RunRow[] | undefined
let cachedDetails: Map<number, RunDetail> | undefined

/** Generates (once per process) a plausible dataset spanning the last 30 days. */
export function getMockRuns(): RunRow[] {
  ensureMockDataset()
  return cachedRuns!
}

/** Full record for one mock run (flags/custom/env) — powers the row-detail slide-over in mock mode. */
export function getMockRunDetail(id: number): RunDetail | undefined {
  ensureMockDataset()
  return cachedDetails!.get(id)
}

function ensureMockDataset(): void {
  if (cachedRuns && cachedDetails) return

  const rng = mulberry32(MOCK_SEED)
  const now = Date.now()

  const drafts = Array.from({ length: MOCK_RUN_COUNT }, () => {
    const tool = weightedPick(rng, MOCK_TOOLS)
    const environment = weightedPick(rng, MOCK_ENVIRONMENTS)
    const command = pick(rng, MOCK_COMMANDS)
    const ageMs = rng() * MOCK_DAYS_SPAN * 24 * 60 * 60 * 1000
    const outcome: 'success' | 'error' = rng() < 0.92 ? 'success' : 'error'
    const durationMs = Math.round(80 + rng() * (command === 'doctor' ? 2500 : 400))

    return {
      timestampMs: now - ageMs,
      tool: tool.name,
      version: tool.version,
      command,
      durationMs,
      outcome,
      errorCode: outcome === 'error' ? pick(rng, MOCK_ERROR_CODES) : null,
      environment: environment.name,
      machineId: pick(rng, MOCK_MACHINE_IDS),
      flags: pickFields(rng, MOCK_FLAG_POOL),
      custom: pickFields(rng, MOCK_CUSTOM_POOL),
      env: {
        node: pick(rng, MOCK_NODE_VERSIONS),
        ci: rng() < 0.2,
        provider: pick(rng, MOCK_PROVIDERS),
        tty: rng() < 0.7,
        agent: pick(rng, MOCK_AGENTS),
      },
    }
  })

  // Ascending by time so `id` mirrors a real `BIGSERIAL` (oldest = smallest).
  drafts.sort((a, b) => a.timestampMs - b.timestampMs)

  const rows: RunRow[] = []
  const details = new Map<number, RunDetail>()

  drafts.forEach((draft, index) => {
    const id = index + 1
    const timestamp = new Date(draft.timestampMs).toISOString()
    const row: RunRow = {
      id,
      tool: draft.tool,
      version: draft.version,
      command: draft.command,
      durationMs: draft.durationMs,
      outcome: draft.outcome,
      errorCode: draft.errorCode,
      environment: draft.environment,
      machineId: draft.machineId,
      timestamp,
    }
    rows.push(row)
    details.set(id, {
      ...row,
      idempotencyKey: `mock-${id}`,
      flags: draft.flags,
      custom: draft.custom,
      env: draft.env,
      receivedAt: timestamp,
    })
  })

  cachedRuns = rows
  cachedDetails = details
}

function filterMockRuns(runs: RunRow[], filter: RunsFilter): RunRow[] {
  const cutoff = rangeToCutoff(filter.range).getTime()
  return runs.filter((run) => {
    if (new Date(run.timestamp).getTime() < cutoff) return false
    if (filter.tool && run.tool !== filter.tool) return false
    if (filter.environment && run.environment !== filter.environment) return false
    return true
  })
}

const SORT_EXTRACTORS: Record<RunSortKey, (run: RunRow) => string | number> = {
  timestamp: run => run.timestamp,
  tool: run => run.tool,
  command: run => run.command,
  environment: run => run.environment,
  outcome: run => run.outcome,
  durationMs: run => run.durationMs,
  machineId: run => run.machineId ?? '',
}

/** Mirrors `runs.get.ts`'s Drizzle `.orderBy()` — sorts a copy, doesn't mutate `runs`. */
function sortMockRuns(runs: RunRow[], sort: RunSortKey, order: SortOrder): RunRow[] {
  const extract = SORT_EXTRACTORS[sort]
  const dir = order === 'asc' ? 1 : -1
  return [...runs].sort((a, b) => {
    const av = extract(a)
    const bv = extract(b)
    if (av < bv) return -dir
    if (av > bv) return dir
    return 0
  })
}

function tallyBy<TLabel extends string>(runs: RunRow[], key: (run: RunRow) => string, label: TLabel): ({ [P in TLabel]: string } & { count: number })[] {
  const counts = new Map<string, number>()
  for (const run of runs) counts.set(key(run), (counts.get(key(run)) ?? 0) + 1)
  return [...counts.entries()]
    .map(([value, count]) => ({ [label]: value, count }) as { [P in TLabel]: string } & { count: number })
    .sort((a, b) => b.count - a.count)
}

/** Mirrors `server/api/telemetry/stats.get.ts`'s SQL aggregation, in memory. */
export function computeMockStats(filter: RunsFilter): StatsResponse {
  const runs = filterMockRuns(getMockRuns(), filter)

  const success = runs.filter(r => r.outcome === 'success').length
  const errors = runs.length - success
  const machines = new Set(runs.map(r => r.machineId)).size
  const avgDurationMs = runs.length > 0
    ? Math.round(runs.reduce((sum, r) => sum + r.durationMs, 0) / runs.length)
    : 0

  const environments = tallyBy(runs, r => r.environment, 'environment') as EnvironmentCount[]
  const tools = tallyBy(runs, r => r.tool, 'tool') as ToolCount[]

  const commandGroups = new Map<string, { count: number, success: number, totalDuration: number }>()
  for (const run of runs) {
    const group = commandGroups.get(run.command) ?? { count: 0, success: 0, totalDuration: 0 }
    group.count++
    if (run.outcome === 'success') group.success++
    group.totalDuration += run.durationMs
    commandGroups.set(run.command, group)
  }
  const commands: CommandStat[] = [...commandGroups.entries()]
    .map(([command, group]) => ({
      command,
      count: group.count,
      successRate: group.count > 0 ? group.success / group.count : 0,
      avgDurationMs: group.count > 0 ? Math.round(group.totalDuration / group.count) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const dayGroups = new Map<string, { success: number, errors: number }>()
  for (const run of runs) {
    const day = run.timestamp.slice(0, 10)
    const group = dayGroups.get(day) ?? { success: 0, errors: 0 }
    if (run.outcome === 'success') group.success++
    else group.errors++
    dayGroups.set(day, group)
  }
  const daily: DailyActivity[] = [...dayGroups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, group]) => ({ day, success: group.success, errors: group.errors }))

  return {
    range: filter.range,
    totals: { total: runs.length, success, errors, machines, avgDurationMs },
    environments,
    tools,
    commands,
    daily,
    mock: true,
  }
}

export interface MockRunsPageOptions {
  sort: RunSortKey
  order: SortOrder
  page: number
  pageSize: number
}

/** Mirrors `server/api/telemetry/runs.get.ts`'s sorted, offset-paginated query, in memory. */
export function computeMockRunsPage(filter: RunsFilter, { sort, order, page, pageSize }: MockRunsPageOptions): RunsResponse {
  const filtered = sortMockRuns(filterMockRuns(getMockRuns(), filter), sort, order)
  const start = (page - 1) * pageSize

  return {
    runs: filtered.slice(start, start + pageSize),
    total: filtered.length,
  }
}
