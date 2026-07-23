// Explicit import (unlike the rest of `server/utils/`) because this module's
// pure functions are unit-tested directly with plain vitest, outside Nitro's
// auto-import context.
import { dailyBucketCount, dailyBucketKeys, fillDailyActivity, fillHourlyActivity, hourlyBucketKeys } from '../../shared/utils/activity-buckets'
import { DURATION_BUCKETS, durationBucketIndex, nodeMajor } from '../../shared/utils/duration-buckets'
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
const MOCK_AGENTS = [null, null, 'cursor', 'claude-code', 'copilot', 'codex']
const MOCK_OSES: (WeightedOption & { os: string, archs: string[] })[] = [
  { os: 'darwin', archs: ['arm64', 'arm64', 'x64'], weight: 0.62 },
  { os: 'linux', archs: ['x64', 'arm64'], weight: 0.3 },
  { os: 'win32', archs: ['x64'], weight: 0.08 },
]
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

/** Deterministic env snapshot for one mock run — mirrors `@evlog/telemetry`'s `EnvInfo`. */
function buildMockEnv(rng: () => number): RunEnvInfo {
  const osEntry = weightedPick(rng, MOCK_OSES)
  return {
    node: pick(rng, MOCK_NODE_VERSIONS),
    ci: rng() < 0.2,
    provider: pick(rng, MOCK_PROVIDERS),
    tty: rng() < 0.7,
    agent: pick(rng, MOCK_AGENTS),
    os: osEntry.os,
    arch: pick(rng, osEntry.archs),
  }
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
      env: buildMockEnv(rng),
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
  // Pre-fill every day/hour bucket in the range so the chart always plots a
  // full, fixed-width timeline instead of shrinking to whichever days have events.
  const dailyRows: DailyActivity[] = [...dayGroups.entries()]
    .map(([day, group]) => ({ day, success: group.success, errors: group.errors }))
  const daily = fillDailyActivity(dailyBucketKeys(dailyBucketCount(filter.range)), dailyRows)

  let hourly: HourlyActivity[] = []
  if (filter.range === '24h') {
    const hourGroups = new Map<string, { success: number, errors: number }>()
    for (const run of runs) {
      const hour = `${run.timestamp.slice(0, 13)}:00`
      const group = hourGroups.get(hour) ?? { success: 0, errors: 0 }
      if (run.outcome === 'success') group.success++
      else group.errors++
      hourGroups.set(hour, group)
    }
    const hourlyRows: HourlyActivity[] = [...hourGroups.entries()]
      .map(([hour, group]) => ({ hour, success: group.success, errors: group.errors }))
    hourly = fillHourlyActivity(hourlyBucketKeys(24), hourlyRows)
  }

  // env-level aggregations read the full detail record (RunRow has no env block).
  const envs = runs.map(run => getMockRunDetail(run.id)!.env)

  const agentCounts = new Map<string | null, number>()
  for (const env of envs) agentCounts.set(env.agent, (agentCounts.get(env.agent) ?? 0) + 1)
  const agents: AgentCount[] = [...agentCounts.entries()]
    .map(([agent, count]) => ({ agent, count }))
    .sort((a, b) => b.count - a.count)

  const ciRuns = envs.filter(env => env.ci).length
  const providerCounts = new Map<string, number>()
  for (const env of envs) {
    if (env.provider) providerCounts.set(env.provider, (providerCounts.get(env.provider) ?? 0) + 1)
  }
  const ci: CiStats = {
    ci: ciRuns,
    local: envs.length - ciRuns,
    providers: [...providerCounts.entries()]
      .map(([provider, count]) => ({ provider, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
  }

  const nodeCounts = new Map<string, number>()
  for (const env of envs) {
    const major = nodeMajor(env.node)
    nodeCounts.set(major, (nodeCounts.get(major) ?? 0) + 1)
  }
  const nodeVersions: VersionCount[] = [...nodeCounts.entries()]
    .map(([version, count]) => ({ version, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  const toolVersionCounts = new Map<string, number>()
  for (const run of runs) toolVersionCounts.set(run.version, (toolVersionCounts.get(run.version) ?? 0) + 1)
  const toolVersions: VersionCount[] = [...toolVersionCounts.entries()]
    .map(([version, count]) => ({ version, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  const osCounts = new Map<string | null, number>()
  for (const env of envs) osCounts.set(env.os, (osCounts.get(env.os) ?? 0) + 1)
  const os: OsCount[] = [...osCounts.entries()]
    .map(([value, count]) => ({ os: value, count }))
    .sort((a, b) => b.count - a.count)

  const errorGroups = new Map<string, { count: number, lastSeen: string }>()
  for (const run of runs) {
    if (run.outcome !== 'error' || !run.errorCode) continue
    const group = errorGroups.get(run.errorCode) ?? { count: 0, lastSeen: run.timestamp }
    group.count++
    if (run.timestamp > group.lastSeen) group.lastSeen = run.timestamp
    errorGroups.set(run.errorCode, group)
  }
  const errorCodes: ErrorCodeStat[] = [...errorGroups.entries()]
    .map(([errorCode, group]) => ({ errorCode, count: group.count, lastSeen: group.lastSeen }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  const sortedDurations = runs.map(r => r.durationMs).sort((a, b) => a - b)
  const histogramCounts = DURATION_BUCKETS.map(bucket => ({ bucket: bucket.label, count: 0 }))
  for (const duration of sortedDurations) histogramCounts[durationBucketIndex(duration)]!.count++
  const durations: DurationStats = {
    p50: percentile(sortedDurations, 0.5),
    p95: percentile(sortedDurations, 0.95),
    histogram: histogramCounts,
  }

  const lastEventAt = runs.length > 0
    ? runs.reduce((max, run) => (run.timestamp > max ? run.timestamp : max), runs[0]!.timestamp)
    : null

  return {
    range: filter.range,
    totals: { total: runs.length, success, errors, machines, avgDurationMs },
    environments,
    tools,
    commands,
    daily,
    hourly,
    agents,
    ci,
    nodeVersions,
    toolVersions,
    os,
    errorCodes,
    durations,
    lastEventAt,
    mock: true,
  }
}

/** Linear-interpolated percentile, mirroring Postgres's `percentile_cont`. Expects `sorted` ascending. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const rank = p * (sorted.length - 1)
  const low = Math.floor(rank)
  const high = Math.ceil(rank)
  const lowValue = sorted[low]!
  const highValue = sorted[high]!
  return Math.round(lowValue + (highValue - lowValue) * (rank - low))
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
