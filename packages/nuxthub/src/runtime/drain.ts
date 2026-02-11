import type { DrainContext, WideEvent } from 'evlog'
import { defineNitroPlugin } from 'nitropack/runtime'
// @ts-expect-error nuxthub/db is a virtual module provided by @nuxthub/core
import { db, schema } from '@nuxthub/db'

type EventRow = typeof schema.evlogEvents.$inferInsert

function parseDurationMs(event: WideEvent): number | null {
  if (typeof event.durationMs === 'number') return event.durationMs
  if (typeof event.duration === 'number') return event.duration
  if (typeof event.duration === 'string') {
    const str = event.duration as string
    const msMatch = str.match(/^([\d.]+)\s*ms$/)
    if (msMatch) return Math.round(Number.parseFloat(msMatch[1]))
    const sMatch = str.match(/^([\d.]+)\s*s$/)
    if (sMatch) return Math.round(Number.parseFloat(sMatch[1]) * 1000)
  }
  return null
}

function extractRow(ctx: DrainContext): EventRow {
  const { event, request } = ctx

  // Fields that go into indexed columns
  const indexed = new Set([
    'timestamp',
    'level',
    'service',
    'environment',
    'method',
    'path',
    'status',
    'durationMs',
    'duration',
    'requestId',
    'source',
    'error',
    // Also exclude base fields that are already captured
    'version',
    'commitHash',
    'region',
  ])

  // Collect remaining fields into data
  const data: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(event)) {
    if (!indexed.has(key) && value !== undefined) {
      data[key] = value
    }
  }

  const errorValue = event.error
  let errorJson: string | null = null
  if (errorValue !== undefined && errorValue !== null) {
    errorJson = typeof errorValue === 'string' ? errorValue : JSON.stringify(errorValue)
  }

  return {
    id: crypto.randomUUID(),
    timestamp: event.timestamp,
    level: event.level,
    service: event.service,
    environment: event.environment,
    method: (request?.method ?? event.method as string) || null,
    path: (request?.path ?? event.path as string) || null,
    status: typeof event.status === 'number' ? event.status : null,
    durationMs: parseDurationMs(event),
    requestId: (request?.requestId ?? event.requestId as string) || null,
    source: (event.source as string) || null,
    error: errorJson,
    data: Object.keys(data).length > 0 ? JSON.stringify(data) : null,
    createdAt: new Date().toISOString(),
  }
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', async (ctx: DrainContext | DrainContext[]) => {
    try {
      const contexts = Array.isArray(ctx) ? ctx : [ctx]
      if (contexts.length === 0) return

      const rows = contexts.map(extractRow)

      await db.insert(schema.evlogEvents).values(rows)
    } catch (error) {
      console.error('[evlog/nuxthub] Failed to insert events:', error)
    }
  })
})
