import type { PgColumn } from 'drizzle-orm/pg-core'
import { and, asc, avg, count, countDistinct, desc, eq, isNotNull, sql } from 'drizzle-orm'

/** Drivers return `timestamptz` from raw `sql` fragments as strings or Dates — normalize to ISO. */
function toIsoTimestamp(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** `date_trunc` unit for a granularity — a literal from a closed set, never user input. */
function truncUnit(granularity: TimelineGranularity) {
  return sql.raw(`'${granularity}'`)
}

/**
 * `classifySource()` expressed in SQL — the two must agree, or the mock
 * dataset and the real one would disagree about what a source is.
 */
const SOURCE_KIND_EXPR = sql<SourceKind>`case
  when ${schema.runs.envCi} then 'ci'
  when ${schema.runs.envAgent} is not null then 'agent'
  when ${schema.runs.envTty} then 'terminal'
  else 'automation'
end`

const SOURCE_ID_EXPR = sql<string>`case
  when ${schema.runs.envCi} then coalesce(nullif(trim(${schema.runs.envProvider}), ''), ${UNKNOWN_PROVIDER})
  when ${schema.runs.envAgent} is not null then ${schema.runs.envAgent}
  when ${schema.runs.envTty} then 'terminal'
  else 'automation'
end`

/** Bucket key expression matching {@link timelineBucketKey}'s output, so SQL rows merge into the pre-filled timeline. */
function bucketExpr(granularity: TimelineGranularity) {
  return granularity === 'hour'
    ? sql<string>`to_char(date_trunc('hour', ${schema.runs.eventTimestamp}), 'YYYY-MM-DD"T"HH24:00')`
    : sql<string>`to_char(date_trunc('day', ${schema.runs.eventTimestamp}), 'YYYY-MM-DD')`
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
  const granularity = timelineGranularity(filter.range)
  const bucket = bucketExpr(granularity)
  const successCount = sql<number>`count(*) filter (where ${schema.runs.outcome} = 'success')`
  const errorCount = sql<number>`count(*) filter (where ${schema.runs.outcome} = 'error')`
  const runCount = sql<number>`count(*)`
  const avgDuration = sql<number>`coalesce(${avg(schema.runs.durationMs)}, 0)`
  const p95Duration = sql<number>`coalesce(percentile_cont(0.95) within group (order by ${schema.runs.durationMs}), 0)`
  // Thresholds shared with the mock dataset and the dashboard histogram —
  // `width_bucket` maps a duration to 0..N matching `DURATION_BUCKETS` indices.
  // Bounds are compile-time constants (never user input), inlined because
  // bound parameters lose the int[] typing `width_bucket(anyelement, anyarray)`
  // resolves against.
  const bucketBounds = DURATION_BUCKETS.slice(1).map(b => b.min)
  const bucketIndex = sql<number>`width_bucket(${schema.runs.durationMs}, ${sql.raw(`array[${bucketBounds.join(', ')}]`)})`
  const nodeMajorExpr = sql<string>`regexp_replace(split_part(${schema.runs.envNode}, '.', 1), '^v', '')`

  const [totals, previous, environments, tools, commands, timeline, previousTimeline, sources, nodeVersions, toolVersions, osBreakdown, errorCodes, histogram] = await Promise.all([
    db.select({
      total: runCount,
      success: successCount,
      errors: errorCount,
      machines: countDistinct(schema.runs.machineId),
      avgDurationMs: avgDuration,
      p50: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${schema.runs.durationMs}), 0)`,
      p95: p95Duration,
      lastEventAt: sql<string | null>`max(${schema.runs.eventTimestamp})`,
    }).from(schema.runs).where(where),

    // Same shape one window back — the baseline for the KPI cards' deltas.
    db.select({
      total: runCount,
      success: successCount,
      errors: errorCount,
      machines: countDistinct(schema.runs.machineId),
      avgDurationMs: avgDuration,
      p95DurationMs: p95Duration,
    }).from(schema.runs).where(buildPreviousRunsWhere(filter)),

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
      avgDurationMs: avgDuration,
      p95DurationMs: p95Duration,
    })
      .from(schema.runs).where(where)
      .groupBy(schema.runs.command)
      .orderBy(desc(runCount))
      .limit(10),

    // One grouped pass backs both the activity chart and every KPI sparkline —
    // the alternative is a separate per-bucket query per trended metric.
    db.select({
      bucket,
      success: successCount,
      errors: errorCount,
      machines: countDistinct(schema.runs.machineId),
      avgDurationMs: avgDuration,
      p95DurationMs: p95Duration,
    })
      .from(schema.runs).where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1 asc`),

    // Same buckets, one window back — drives the activity chart's ghost line.
    db.select({ bucket, count: runCount })
      .from(schema.runs).where(buildPreviousRunsWhere(filter))
      .groupBy(sql`1`)
      .orderBy(sql`1 asc`),

    db.select({ kind: SOURCE_KIND_EXPR, id: SOURCE_ID_EXPR, count: runCount })
      .from(schema.runs).where(where)
      .groupBy(sql`1, 2`)
      .orderBy(desc(runCount)),

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
    filter: describeFilter(filter),
    granularity,
    totals: {
      total: Number(totals[0]?.total ?? 0),
      success: Number(totals[0]?.success ?? 0),
      errors: Number(totals[0]?.errors ?? 0),
      machines: Number(totals[0]?.machines ?? 0),
      avgDurationMs: Math.round(Number(totals[0]?.avgDurationMs ?? 0)),
    },
    previous: {
      total: Number(previous[0]?.total ?? 0),
      success: Number(previous[0]?.success ?? 0),
      errors: Number(previous[0]?.errors ?? 0),
      machines: Number(previous[0]?.machines ?? 0),
      avgDurationMs: Math.round(Number(previous[0]?.avgDurationMs ?? 0)),
      p95DurationMs: Math.round(Number(previous[0]?.p95DurationMs ?? 0)),
    },
    environments: environments.map(r => ({ environment: r.environment, count: Number(r.count) })),
    tools: tools.map(r => ({ tool: r.tool, count: Number(r.count) })),
    commands: commands.map(r => ({
      command: r.command,
      count: Number(r.count),
      successRate: Number(r.count) > 0 ? Number(r.success) / Number(r.count) : 0,
      avgDurationMs: Math.round(Number(r.avgDurationMs)),
      p95DurationMs: Math.round(Number(r.p95DurationMs)),
    })),
    // Pre-fill every bucket in the range so the chart always plots a full,
    // fixed-width timeline instead of shrinking to whichever buckets have events.
    timeline: fillTimeline(
      timelineBucketKeys(filter.range),
      timeline.map(r => ({
        bucket: r.bucket,
        success: Number(r.success),
        errors: Number(r.errors),
        machines: Number(r.machines),
        avgDurationMs: Math.round(Number(r.avgDurationMs)),
        p95DurationMs: Math.round(Number(r.p95DurationMs)),
      })),
      emptyActivityPoint,
    ),
    previousRuns: fillTimeline(
      previousTimelineBucketKeys(filter.range),
      previousTimeline.map(r => ({ bucket: r.bucket, count: Number(r.count) })),
      bucketKey => ({ bucket: bucketKey, count: 0 }),
    ).map(point => point.count),
    sources: sources.map(r => ({ kind: r.kind, id: r.id, count: Number(r.count) })),
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

/** Echoes a filter back on the response, so a client can tell which one produced it. */
function describeFilter(filter: RunsFilter): AppliedFilter {
  return {
    tool: filter.tool,
    environment: filter.environment,
    source: filter.source ? sourceToken(filter.source) : undefined,
  }
}

/** Rows pulled per jsonb field breakdown before the top keys/values are picked in JS. */
const FIELD_ROW_LIMIT = 200

/**
 * Adoption aggregates: version rollout over time, new vs returning machines,
 * the weekday/hour punchcard, and the `flags`/`custom` jsonb breakdowns —
 * mock-mode aware. Shared by `GET /api/telemetry/adoption` and the
 * `telemetry-adoption` MCP tool.
 *
 * Kept out of {@link getStatsForFilter} because the two jsonb scans and the
 * first-seen join are the most expensive queries in the app, and only one tab
 * ever looks at them.
 */
export async function getAdoptionForFilter(filter: RunsFilter): Promise<AdoptionResponse> {
  if (await shouldUseMockData()) {
    return computeMockAdoption(filter)
  }

  const where = buildRunsWhere(filter)
  const granularity = timelineGranularity(filter.range)
  const bucket = bucketExpr(granularity)
  const unit = truncUnit(granularity)
  const runCount = sql<number>`count(*)`
  const errorCount = sql<number>`count(*) filter (where ${schema.runs.outcome} = 'error')`

  /**
   * A machine counts as new the first time it is *ever* seen — so first-seen
   * is computed over the whole table, unfiltered, and joined back in. Scoping
   * it to the current window would label every machine as new on the oldest
   * bucket of every range.
   */
  const firstSeen = db.$with('first_seen').as(
    db.select({
      machineId: schema.runs.machineId,
      firstAt: sql<string>`min(${schema.runs.eventTimestamp})`.as('first_at'),
    })
      .from(schema.runs)
      .where(isNotNull(schema.runs.machineId))
      .groupBy(schema.runs.machineId),
  )

  /** `flags` and `custom` are `jsonb` objects — expand them to key/value rows and tally per pair. */
  const fieldBreakdown = (column: PgColumn) =>
    db.select({
      key: sql<string>`kv.key`,
      value: sql<string>`kv.value`,
      count: runCount,
      errors: errorCount,
    })
      .from(schema.runs)
      .crossJoinLateral(sql`jsonb_each_text(${column}) as kv`)
      .where(where)
      .groupBy(sql`1, 2`)
      .orderBy(desc(runCount))
      .limit(FIELD_ROW_LIMIT)

  const [versionRows, machineRows, punchcard, flagRows, customRows, frameworkRows] = await Promise.all([
    db.select({ bucket, version: schema.runs.toolVersion, count: runCount })
      .from(schema.runs).where(where)
      .groupBy(sql`1, 2`),

    db.with(firstSeen).select({
      bucket,
      active: countDistinct(schema.runs.machineId),
      new: sql<number>`count(distinct ${schema.runs.machineId}) filter (where date_trunc(${unit}, ${firstSeen.firstAt}) = date_trunc(${unit}, ${schema.runs.eventTimestamp}))`,
    })
      .from(schema.runs)
      .innerJoin(firstSeen, eq(firstSeen.machineId, schema.runs.machineId))
      .where(where)
      .groupBy(sql`1`),

    db.select({
      weekday: sql<number>`extract(isodow from ${schema.runs.eventTimestamp})::int`,
      hour: sql<number>`extract(hour from ${schema.runs.eventTimestamp})::int`,
      count: runCount,
    })
      .from(schema.runs).where(where)
      .groupBy(sql`1, 2`),

    fieldBreakdown(schema.runs.flags),
    fieldBreakdown(schema.runs.custom),

    /**
     * Framework per bucket, read straight off the `custom` jsonb.
     *
     * Only the framework keys are expanded rather than every pair — the full
     * `jsonb_each_text` cross join is the most expensive read in the app, and
     * a tool reporting forty counters would multiply the row count by forty
     * for two of them. `coalesce` picks whichever key the run carries; a run
     * reporting both counts once, under `map`'s answer.
     */
    db.select({
      bucket,
      framework: sql<string>`coalesce(
        ${schema.runs.custom} ->> 'mapFramework',
        ${schema.runs.custom} ->> 'initFramework'
      )`.as('framework'),
      count: runCount,
    })
      .from(schema.runs)
      .where(and(
        where,
        sql`${schema.runs.custom} ?| array['mapFramework', 'initFramework']`,
      ))
      .groupBy(sql`1, 2`),
  ])

  const keys = timelineBucketKeys(filter.range)
  const { dimensions, fields: customFields } = splitFieldStats(
    customRows.map(r => ({ key: r.key, value: r.value, count: Number(r.count), errors: Number(r.errors) })),
    PROMOTED_FIELD_KEYS,
  )
  const { versions, points } = toVersionAdoption(
    versionRows.map(r => ({ bucket: r.bucket, version: r.version, count: Number(r.count) })),
    keys,
  )
  const frameworkTimeline = toStackedSeries(
    frameworkRows
      .filter(r => r.framework !== null)
      .map(r => ({ bucket: r.bucket, series: frameworkSeries(r.framework), count: Number(r.count) })),
    keys,
    MAX_FRAMEWORK_SERIES,
  )

  return {
    range: filter.range,
    granularity,
    versions,
    versionAdoption: points,
    machines: fillTimeline(
      keys,
      machineRows.map(r => ({ bucket: r.bucket, active: Number(r.active), new: Number(r.new) })),
      bucketKey => ({ bucket: bucketKey, active: 0, new: 0 }),
    ),
    punchcard: punchcard.map(r => ({ weekday: Number(r.weekday), hour: Number(r.hour), count: Number(r.count) })),
    flags: toFieldStats(normalizeFlagRows(flagRows.map(r => ({ key: r.key, value: r.value, count: Number(r.count), errors: Number(r.errors) })))),
    custom: customFields,
    dimensions,
    frameworks: frameworkTimeline.series,
    frameworkAdoption: frameworkTimeline.points,
    mock: false,
  }
}

/**
 * Cheapest possible "has anything changed?" probe — two `max()` lookups the
 * planner answers from the primary key and the `event_timestamp` index
 * without touching the heap.
 *
 * This is what the dashboard polls on its fast cadence. Recomputing the full
 * stats aggregation on every tick costs ~800ms of database CPU on a 30-day
 * window; this costs a fraction of a millisecond, so the UI can check often
 * and only pay for the real queries when an event actually landed.
 *
 * Deliberately unfiltered: a new run for a tool the viewer filtered out
 * triggers one wasted (and server-cached) refresh, which is far cheaper than
 * making the probe itself filter-aware.
 */
export async function getRunsCursor(): Promise<RunsCursor> {
  if (await shouldUseMockData()) {
    return { latestId: 0, latestAt: null }
  }

  const [row] = await db.select({
    latestId: sql<number | null>`max(${schema.runs.id})`,
    latestAt: sql<string | null>`max(${schema.runs.eventTimestamp})`,
  }).from(schema.runs)

  return {
    latestId: Number(row?.latestId ?? 0),
    latestAt: toIsoTimestamp(row?.latestAt),
  }
}

export interface RunsPageOptions {
  sort: RunSortKey
  order: SortOrder
  page: number
  pageSize: number
  /**
   * Whether to also run the `count(*)` over the whole filtered range. Only
   * the paginated table needs it; the live feed asks for 8 rows and shows no
   * pagination, so it would otherwise pay for a full range scan on every
   * single poll just to throw the number away.
   */
  withTotal?: boolean
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
  const withTotal = options.withTotal ?? true

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

    withTotal
      ? db.select({ total: count() }).from(schema.runs).where(where)
      : Promise.resolve([{ total: 0 }]),
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
