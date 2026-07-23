/**
 * Auto-imported (via Nuxt's `shared/types/` convention) into both `app/` and
 * `server/` — no import statements needed on either side.
 */

export type StatsRange = '24h' | '7d' | '30d'

/** Columns the raw events browser can be sorted by. */
export type RunSortKey = 'timestamp' | 'tool' | 'command' | 'environment' | 'outcome' | 'durationMs' | 'machineId'

export type SortOrder = 'asc' | 'desc'

export interface EnvironmentCount {
  environment: string
  count: number
}

export interface ToolCount {
  tool: string
  count: number
}

export interface CommandStat {
  command: string
  count: number
  successRate: number
  avgDurationMs: number
}

export interface DailyActivity {
  day: string
  success: number
  errors: number
}

export interface StatsTotals {
  total: number
  success: number
  errors: number
  machines: number
  avgDurationMs: number
}

/** Runs grouped by AI coding agent — `agent: null` means a plain terminal (human) run. */
export interface AgentCount {
  agent: string | null
  count: number
}

/** Runs grouped by CI provider (only rows where a provider was detected). */
export interface ProviderCount {
  provider: string
  count: number
}

/** CI vs local split plus the provider breakdown. */
export interface CiStats {
  ci: number
  local: number
  providers: ProviderCount[]
}

/** Generic `version → count` pair (Node majors, tool versions). */
export interface VersionCount {
  version: string
  count: number
}

/** Runs grouped by operating system platform — `os: null` for events from older clients. */
export interface OsCount {
  os: string | null
  count: number
}

/** Runs grouped by error code, most frequent first. */
export interface ErrorCodeStat {
  errorCode: string
  count: number
  /** ISO timestamp of the most recent occurrence. */
  lastSeen: string
}

/** One bar of the duration histogram — `bucket` is the shared label from `DURATION_BUCKETS`. */
export interface DurationBucket {
  bucket: string
  count: number
}

/** Duration percentiles plus the histogram (`DurationBucket[]`) backing `DurationHistogram`. */
export interface DurationStats {
  p50: number
  p95: number
  histogram: DurationBucket[]
}

/** Hourly resolution of `DailyActivity` — only populated when `range` is `24h`. */
export interface HourlyActivity {
  /** Hour bucket as `YYYY-MM-DDTHH:00` (UTC). */
  hour: string
  success: number
  errors: number
}

export interface StatsResponse {
  range: StatsRange
  totals: StatsTotals
  environments: EnvironmentCount[]
  tools: ToolCount[]
  commands: CommandStat[]
  daily: DailyActivity[]
  /** Hourly activity — empty unless `range` is `24h`. */
  hourly: HourlyActivity[]
  agents: AgentCount[]
  ci: CiStats
  nodeVersions: VersionCount[]
  toolVersions: VersionCount[]
  os: OsCount[]
  errorCodes: ErrorCodeStat[]
  durations: DurationStats
  /** ISO timestamp of the newest event in the current filter — `null` when empty. */
  lastEventAt: string | null
  /** `true` when this response is generated sample data (the `runs` table is empty). */
  mock: boolean
}

export interface RunRow {
  id: number
  tool: string
  version: string
  command: string
  durationMs: number
  outcome: 'success' | 'error'
  errorCode: string | null
  environment: string
  machineId: string | null
  timestamp: string
}

export interface RunsResponse {
  runs: RunRow[]
  /** Total rows matching the current filter (for `<UPagination>`), not just this page. */
  total: number
}

/** Environment snapshot captured alongside a run — see `@evlog/telemetry`'s `EnvInfo`. */
export interface RunEnvInfo {
  node: string
  ci: boolean
  provider: string | null
  tty: boolean
  agent: string | null
  os: string | null
  arch: string | null
}

/** Full record for one run, including the wide-event metadata not needed by the list view. */
export interface RunDetail extends RunRow {
  idempotencyKey: string
  flags: Record<string, boolean | number | string>
  custom: Record<string, boolean | number | string>
  env: RunEnvInfo
  receivedAt: string
}
