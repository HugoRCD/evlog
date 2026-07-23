import { and, eq, gte } from 'drizzle-orm'

export interface RunsFilter {
  range: StatsRange
  tool?: string
  environment?: string
}

/** Drizzle `WHERE` condition (range + optional tool/environment) for the `runs` table. */
export function buildRunsWhere(filter: RunsFilter) {
  return and(
    gte(schema.runs.eventTimestamp, rangeToCutoff(filter.range)),
    filter.tool ? eq(schema.runs.toolName, filter.tool) : undefined,
    filter.environment ? eq(schema.runs.environment, filter.environment) : undefined,
  )
}

/** Maps a `RunSortKey` (UI column) to the `runs` table's Drizzle column — allowlisted, never built from raw SQL. */
export const RUN_SORT_COLUMNS = {
  timestamp: schema.runs.eventTimestamp,
  tool: schema.runs.toolName,
  command: schema.runs.command,
  environment: schema.runs.environment,
  outcome: schema.runs.outcome,
  durationMs: schema.runs.durationMs,
  machineId: schema.runs.machineId,
} satisfies Record<RunSortKey, unknown>
