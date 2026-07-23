import { asc, avg, count, countDistinct, desc, eq, sql } from 'drizzle-orm'

/**
 * Aggregate totals/environments/tools/commands/daily-activity for a filter —
 * mock-mode aware. Shared by `GET /api/telemetry/stats` and the
 * `telemetry-stats` MCP tool so both surfaces stay in sync.
 */
export async function getStatsForFilter(filter: RunsFilter): Promise<StatsResponse> {
  if (await shouldUseMockData()) {
    return computeMockStats(filter)
  }

  const where = buildRunsWhere(filter)
  const successCount = sql<number>`count(*) filter (where ${schema.runs.outcome} = 'success')`
  const errorCount = sql<number>`count(*) filter (where ${schema.runs.outcome} = 'error')`
  const runCount = sql<number>`count(*)`

  const [totals, environments, tools, commands, daily] = await Promise.all([
    db.select({
      total: runCount,
      success: successCount,
      errors: errorCount,
      machines: countDistinct(schema.runs.machineId),
      avgDurationMs: sql<number>`coalesce(${avg(schema.runs.durationMs)}, 0)`,
    }).from(schema.runs).where(where),

    db.select({ environment: schema.runs.environment, count: runCount })
      .from(schema.runs).where(where)
      .groupBy(schema.runs.environment)
      .orderBy(desc(runCount)),

    db.select({ tool: schema.runs.toolName, count: runCount })
      .from(schema.runs).where(where)
      .groupBy(schema.runs.toolName)
      .orderBy(desc(runCount)),

    db.select({
      command: schema.runs.command,
      count: runCount,
      success: successCount,
      avgDurationMs: sql<number>`coalesce(${avg(schema.runs.durationMs)}, 0)`,
    })
      .from(schema.runs).where(where)
      .groupBy(schema.runs.command)
      .orderBy(desc(runCount))
      .limit(10),

    db.select({
      day: sql<string>`to_char(date_trunc('day', ${schema.runs.eventTimestamp}), 'YYYY-MM-DD')`,
      success: successCount,
      errors: errorCount,
    })
      .from(schema.runs).where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1 asc`),
  ])

  return {
    range: filter.range,
    totals: {
      total: Number(totals[0]?.total ?? 0),
      success: Number(totals[0]?.success ?? 0),
      errors: Number(totals[0]?.errors ?? 0),
      machines: Number(totals[0]?.machines ?? 0),
      avgDurationMs: Math.round(Number(totals[0]?.avgDurationMs ?? 0)),
    },
    environments: environments.map(r => ({ environment: r.environment, count: Number(r.count) })),
    tools: tools.map(r => ({ tool: r.tool, count: Number(r.count) })),
    commands: commands.map(r => ({
      command: r.command,
      count: Number(r.count),
      successRate: Number(r.count) > 0 ? Number(r.success) / Number(r.count) : 0,
      avgDurationMs: Math.round(Number(r.avgDurationMs)),
    })),
    daily: daily.map(r => ({ day: r.day, success: Number(r.success), errors: Number(r.errors) })),
    mock: false,
  }
}

export interface RunsPageOptions {
  sort: RunSortKey
  order: SortOrder
  page: number
  pageSize: number
}

/**
 * Sorted, paginated runs page for a filter — mock-mode aware. Shared by
 * `GET /api/telemetry/runs` and the `telemetry-runs` MCP tool.
 */
export async function getRunsPageForFilter(filter: RunsFilter, options: RunsPageOptions): Promise<RunsResponse> {
  if (await shouldUseMockData()) {
    return computeMockRunsPage(filter, options)
  }

  const where = buildRunsWhere(filter)
  const sortColumn = RUN_SORT_COLUMNS[options.sort]

  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db.select({
      id: schema.runs.id,
      tool: schema.runs.toolName,
      version: schema.runs.toolVersion,
      command: schema.runs.command,
      durationMs: schema.runs.durationMs,
      outcome: schema.runs.outcome,
      errorCode: schema.runs.errorCode,
      environment: schema.runs.environment,
      machineId: schema.runs.machineId,
      eventTimestamp: schema.runs.eventTimestamp,
    })
      .from(schema.runs)
      .where(where)
      .orderBy(options.order === 'asc' ? asc(sortColumn) : desc(sortColumn))
      .limit(options.pageSize)
      .offset((options.page - 1) * options.pageSize),

    db.select({ total: count() }).from(schema.runs).where(where),
  ])

  return {
    runs: rows.map(r => ({
      id: r.id,
      tool: r.tool,
      version: r.version,
      command: r.command,
      durationMs: r.durationMs,
      outcome: r.outcome as 'success' | 'error',
      errorCode: r.errorCode,
      environment: r.environment,
      machineId: r.machineId,
      timestamp: r.eventTimestamp.toISOString(),
    })),
    total,
  }
}

/**
 * Full detail (flags/custom/env) for one run by id — mock-mode aware. Shared
 * by `GET /api/telemetry/runs/:id` and the `telemetry-run` MCP tool. Returns
 * `undefined` instead of throwing so each caller picks its own not-found
 * behavior (HTTP 404 vs. an MCP tool error).
 */
export async function getRunDetailById(id: number): Promise<RunDetail | undefined> {
  if (await shouldUseMockData()) {
    return getMockRunDetail(id)
  }

  const [row] = await db.select().from(schema.runs).where(eq(schema.runs.id, id)).limit(1)
  if (!row) return undefined

  return {
    id: row.id,
    tool: row.toolName,
    version: row.toolVersion,
    command: row.command,
    durationMs: row.durationMs,
    outcome: row.outcome as 'success' | 'error',
    errorCode: row.errorCode,
    environment: row.environment,
    machineId: row.machineId,
    timestamp: row.eventTimestamp.toISOString(),
    idempotencyKey: row.idempotencyKey,
    flags: row.flags as Record<string, boolean | number | string>,
    custom: row.custom as Record<string, boolean | number | string>,
    env: {
      node: row.envNode,
      ci: row.envCi,
      provider: row.envProvider,
      tty: row.envTty,
      agent: row.envAgent,
    },
    receivedAt: row.receivedAt.toISOString(),
  }
}
