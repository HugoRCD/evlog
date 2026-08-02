import { and, eq, gte, isNull, lt, not, sql } from 'drizzle-orm'

export interface RunsFilter {
  range: StatsRange
  tool?: string
  environment?: string
  source?: SourceRef
}

/**
 * Reverses `classifySource()` into SQL. The negative clauses matter: without
 * `ci = false`, filtering on an agent would also match that agent's runs
 * inside a pipeline, which the taxonomy counts as CI.
 */
function buildSourceWhere(source: SourceRef) {
  const local = eq(schema.runs.envCi, false)

  switch (source.kind) {
    case 'ci':
      return and(
        eq(schema.runs.envCi, true),
        source.id === UNKNOWN_PROVIDER
          // Mirrors the `nullif(trim(...))` the aggregation groups by, so
          // clicking the Unknown CI row selects the same rows it counted.
          ? sql`coalesce(nullif(trim(${schema.runs.envProvider}), ''), '') = ''`
          : eq(schema.runs.envProvider, source.id),
      )
    case 'agent':
      return and(local, eq(schema.runs.envAgent, source.id))
    case 'terminal':
      return and(local, isNull(schema.runs.envAgent), eq(schema.runs.envTty, true))
    case 'automation':
      return and(local, isNull(schema.runs.envAgent), not(schema.runs.envTty))
  }
}

/** The tool/environment/source half of a filter — shared by the current and previous windows. */
function buildDimensionWhere(filter: RunsFilter) {
  return [
    filter.tool ? eq(schema.runs.toolName, filter.tool) : undefined,
    filter.environment ? eq(schema.runs.environment, filter.environment) : undefined,
    filter.source ? buildSourceWhere(filter.source) : undefined,
  ]
}

/** Drizzle `WHERE` condition (range + optional tool/environment) for the `runs` table. */
export function buildRunsWhere(filter: RunsFilter) {
  return and(
    gte(schema.runs.eventTimestamp, rangeToCutoff(filter.range)),
    ...buildDimensionWhere(filter),
  )
}

/** Same filter shifted back one full window — the baseline for the KPI deltas. */
export function buildPreviousRunsWhere(filter: RunsFilter) {
  const { from, to } = previousWindow(filter.range)
  return and(
    gte(schema.runs.eventTimestamp, from),
    lt(schema.runs.eventTimestamp, to),
    ...buildDimensionWhere(filter),
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
