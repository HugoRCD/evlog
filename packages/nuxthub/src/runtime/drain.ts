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

const INDEXED_FIELDS = new Set([
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
])

function extractRow(ctx: DrainContext): EventRow {
  const { event, request } = ctx

  // Collect remaining fields into data
  const data: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(event)) {
    if (!INDEXED_FIELDS.has(key) && value !== undefined) {
      data[key] = value
    }
  }

  const errorValue = event.error
  let errorJson: string | null = null
  if (errorValue !== undefined && errorValue !== null) {
    if (typeof errorValue === 'string') {
      errorJson = errorValue
    } else {
      try {
        errorJson = JSON.stringify(errorValue)
      } catch {
        errorJson = String(errorValue)
      }
    }
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

const MAX_ATTEMPTS = 3
const INITIAL_DELAY_MS = 500

const RETRYABLE_CODES = new Set([
  'CONNECT_TIMEOUT',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'CONNECTION_ENDED',
])

function isRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const cause = (error as any).cause
    if (cause && typeof cause.code === 'string') {
      return RETRYABLE_CODES.has(cause.code)
    }
  }
  return false
}

async function insertWithRetry(rows: EventRow[]): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await db.insert(schema.evlogEvents).values(rows)
      return
    } catch (error) {
      if (attempt === MAX_ATTEMPTS || !isRetryable(error)) throw error
      await new Promise(r => setTimeout(r, INITIAL_DELAY_MS * 2 ** (attempt - 1)))
    }
  }
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', async (ctx: DrainContext | DrainContext[]) => {
    try {
      const contexts = Array.isArray(ctx) ? ctx : [ctx]
      if (contexts.length === 0) return

      const rows = contexts.map(extractRow)

      await insertWithRetry(rows)
    } catch (error) {
      console.error('[evlog/nuxthub] Failed to insert events:', error)
    }
  })
})
