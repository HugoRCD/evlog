import { and, asc, avg, count, countDistinct, desc, eq, isNotNull, sql } from 'drizzle-orm'

/** Drivers return `timestamptz` from raw `sql` fragments as strings or Dates — normalize to ISO. */
function toIsoTimestamp(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

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
  // Thresholds shared with the mock dataset and the dashboard histogram —
  // `width_bucket` maps a duration to 0..N matching `DURATION_BUCKETS` indices.
  // Bounds are compile-time constants (never user input), inlined because
  // bound parameters lose the int[] typing `width_bucket(anyelement, anyarray)`
  // resolves against.
  const bucketBounds = DURATION_BUCKETS.slice(1).map(b => b.min)
  const bucketIndex = sql<number>`width_bucket(${schema.runs.durationMs}, ${sql.raw(`array[${bucketBounds.join(', ')}]`)})`
  const nodeMajorExpr = sql<string>`regexp_replace(split_part(${schema.runs.envNode}, '.', 1), '^v', '')`

  const [totals, environments, tools, commands, daily, hourly, agents, ciTotals, providers, nodeVersions, toolVersions, osBreakdown, errorCodes, histogram] = await Promise.all([
    db.select({
      total: runCount,
      success: successCount,
      errors: errorCount,
      machines: countDistinct(schema.runs.machineId),
      avgDurationMs: sql<number>`coalesce(${avg(schema.runs.durationMs)}, 0)`,
      p50: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${schema.runs.durationMs}), 0)`,
      p95: sql<number>`coalesce(percentile_cont(0.95) within group (order by ${schema.runs.durationMs}), 0)`,
      lastEventAt: sql<string | null>`max(${schema.runs.eventTimestamp})`,
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

    // Hourly resolution only makes sense on the 24h view — skip the query otherwise.
    filter.range === '24h'
      ? db.select({
        hour: sql<string>`to_char(date_trunc('hour', ${schema.runs.eventTimestamp}), 'YYYY-MM-DD"T"HH24:00')`,
        success: successCount,
        errors: errorCount,
      })
        .from(schema.runs).where(where)
        .groupBy(sql`1`)
        .orderBy(sql`1 asc`)
      : Promise.resolve([]),

    db.select({ agent: schema.runs.envAgent, count: runCount })
      .from(schema.runs).where(where)
      .groupBy(schema.runs.envAgent)
      .orderBy(desc(runCount)),

    db.select({
      ci: sql<number>`count(*) filter (where ${schema.runs.envCi})`,
      local: sql<number>`count(*) filter (where not ${schema.runs.envCi})`,
    }).from(schema.runs).where(where),

    db.select({ provider: schema.runs.envProvider, count: runCount })
      .from(schema.runs)
      .where(and(where, isNotNull(schema.runs.envProvider)))
      .groupBy(schema.runs.envProvider)
      .orderBy(desc(runCount))
      .limit(8),

    db.select({ version: nodeMajorExpr, count: runCount })
      .from(schema.runs).where(where)
      .groupBy(sql`1`)
      .orderBy(desc(runCount))
      .limit(8),

    db.select({ version: schema.runs.toolVersion, count: runCount })
      .from(schema.runs).where(where)
      .groupBy(schema.runs.toolVersion)
      .orderBy(desc(runCount))
      .limit(8),

    db.select({ os: schema.runs.envOs, count: runCount })
      .from(schema.runs).where(where)
      .groupBy(schema.runs.envOs)
      .orderBy(desc(runCount)),

    db.select({
      errorCode: schema.runs.errorCode,
      count: runCount,
      lastSeen: sql<string>`max(${schema.runs.eventTimestamp})`,
    })
      .from(schema.runs)
      .where(and(where, eq(schema.runs.outcome, 'error'), isNotNull(schema.runs.errorCode)))
      .groupBy(schema.runs.errorCode)
      .orderBy(desc(runCount))
      .limit(8),

    db.select({ bucket: bucketIndex, count: runCount })
      .from(schema.runs).where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1 asc`),
  ])

  // Pre-fill every histogram bucket so the chart never changes shape between refreshes.
  const histogramCounts = DURATION_BUCKETS.map((bucket, index) => ({
    bucket: bucket.label,
    count: Number(histogram.find(r => Number(r.bucket) === index)?.count ?? 0),
  }))

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
    // Pre-fill every day/hour bucket in the range so the chart always plots a
    // full, fixed-width timeline instead of shrinking to whichever days have events.
    daily: fillDailyActivity(
      dailyBucketKeys(dailyBucketCount(filter.range)),
      daily.map(r => ({ day: r.day, success: Number(r.success), errors: Number(r.errors) })),
    ),
    hourly: filter.range === '24h'
      ? fillHourlyActivity(
        hourlyBucketKeys(24),
        hourly.map(r => ({ hour: r.hour, success: Number(r.success), errors: Number(r.errors) })),
      )
      : [],
    agents: agents.map(r => ({ agent: r.agent, count: Number(r.count) })),
    ci: {
      ci: Number(ciTotals[0]?.ci ?? 0),
      local: Number(ciTotals[0]?.local ?? 0),
      providers: providers.map(r => ({ provider: r.provider!, count: Number(r.count) })),
    },
    nodeVersions: nodeVersions.map(r => ({ version: r.version, count: Number(r.count) })),
    toolVersions: toolVersions.map(r => ({ version: r.version, count: Number(r.count) })),
    os: osBreakdown.map(r => ({ os: r.os, count: Number(r.count) })),
    errorCodes: errorCodes.map(r => ({
      errorCode: r.errorCode!,
      count: Number(r.count),
      lastSeen: toIsoTimestamp(r.lastSeen) ?? '',
    })),
    durations: {
      p50: Math.round(Number(totals[0]?.p50 ?? 0)),
      p95: Math.round(Number(totals[0]?.p95 ?? 0)),
      histogram: histogramCounts,
    },
    lastEventAt: toIsoTimestamp(totals[0]?.lastEventAt),
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
      os: row.envOs,
      arch: row.envArch,
    },
    receivedAt: row.receivedAt.toISOString(),
  }
}
