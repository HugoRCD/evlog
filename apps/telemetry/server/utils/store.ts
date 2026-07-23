import type { RunEvent } from '@evlog/telemetry'

/**
 * Insert validated run events, deduping on `idempotencyKey` so outbox
 * retries and backlog drains never double-count a run.
 */
export async function storeRunEvents(events: RunEvent[]): Promise<void> {
  if (events.length === 0) return

  await db.insert(schema.runs).values(events.map(run => ({
    idempotencyKey: run.idempotencyKey,
    toolName: run.tool.name,
    toolVersion: run.tool.version,
    command: run.command,
    durationMs: run.durationMs,
    outcome: run.outcome,
    errorCode: run.errorCode ?? null,
    flags: run.flags,
    custom: run.custom,
    envNode: run.env.node,
    envCi: run.env.ci,
    envProvider: run.env.provider,
    envTty: run.env.tty,
    envAgent: run.env.agent,
    environment: run.env.environment,
    machineId: run.machineId ?? null,
    eventTimestamp: new Date(run.timestamp),
  }))).onConflictDoNothing({ target: schema.runs.idempotencyKey })
}

/** Cheap existence check — powers `shouldUseMockData()`'s "table is empty" fallback. */
export async function hasAnyRuns(): Promise<boolean> {
  const rows = await db.select({ id: schema.runs.id }).from(schema.runs).limit(1)
  return rows.length > 0
}
