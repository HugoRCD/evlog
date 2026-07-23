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

export interface StatsResponse {
  range: StatsRange
  totals: StatsTotals
  environments: EnvironmentCount[]
  tools: ToolCount[]
  commands: CommandStat[]
  daily: DailyActivity[]
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
}

/** Full record for one run, including the wide-event metadata not needed by the list view. */
export interface RunDetail extends RunRow {
  idempotencyKey: string
  flags: Record<string, boolean | number | string>
  custom: Record<string, boolean | number | string>
  env: RunEnvInfo
  receivedAt: string
}
