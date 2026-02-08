import { createError, defineEventHandler, getHeader, getHeaders, getRequestHost, readBody, setResponseStatus } from 'h3'
import { useNitroApp } from 'nitropack/runtime'
import type { IngestPayload, WideEvent } from '../../../../types'
import { getEnvironment } from '../../../../logger'
import { filterSafeHeaders } from '../../../../utils'

const VALID_LEVELS = ['info', 'error', 'warn', 'debug'] as const

function validateOrigin(event: Parameters<typeof defineEventHandler>[0] extends (e: infer E) => unknown ? E : never): void {
  const origin = getHeader(event, 'origin')
  const referer = getHeader(event, 'referer')
  const host = getRequestHost(event)

  const requestOrigin = origin || (referer ? new URL(referer).origin : null)

  if (!requestOrigin) {
    throw createError({ statusCode: 403, message: 'Missing origin header' })
  }

  const originHost = new URL(requestOrigin).host

  if (originHost !== host) {
    throw createError({ statusCode: 403, message: 'Invalid origin' })
  }
}

// ISO 8601 datetime pattern (e.g., 2024-01-31T14:00:00.000Z)
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/

function isValidISOTimestamp(value: string): boolean {
  if (!ISO_8601_REGEX.test(value)) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

function validatePayload(body: unknown): IngestPayload {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 400, message: 'Invalid request body' })
  }

  const payload = body as Record<string, unknown>

  if (payload.timestamp === undefined || payload.timestamp === null) {
    throw createError({ statusCode: 400, message: 'Missing required field: timestamp' })
  }

  const { timestamp: rawTimestamp } = payload
  let timestamp: string
  if (typeof rawTimestamp === 'number') {
    const minTimestamp = new Date('2000-01-01').getTime()
    const maxTimestamp = Date.now() + 24 * 60 * 60 * 1000 // 1 day in the future
    if (rawTimestamp < minTimestamp || rawTimestamp > maxTimestamp) {
      throw createError({ statusCode: 400, message: 'Invalid timestamp: value out of reasonable range' })
    }
    timestamp = new Date(rawTimestamp).toISOString()
  } else if (typeof rawTimestamp === 'string') {
    if (!isValidISOTimestamp(rawTimestamp)) {
      throw createError({ statusCode: 400, message: 'Invalid timestamp: must be a valid ISO 8601 datetime string' })
    }
    timestamp = rawTimestamp
  } else {
    throw createError({ statusCode: 400, message: 'Invalid timestamp: must be string or number' })
  }

  if (!payload.level || typeof payload.level !== 'string') {
    throw createError({ statusCode: 400, message: 'Missing required field: level' })
  }

  if (!VALID_LEVELS.includes(payload.level as typeof VALID_LEVELS[number])) {
    throw createError({ statusCode: 400, message: `Invalid level: must be one of ${VALID_LEVELS.join(', ')}` })
  }

  return {
    ...payload,
    timestamp,
    level: payload.level as IngestPayload['level'],
  }
}

function getSafeHeaders(event: Parameters<typeof defineEventHandler>[0] extends (e: infer E) => unknown ? E : never): Record<string, string> {
  const allHeaders = getHeaders(event as Parameters<typeof getHeaders>[0])
  return filterSafeHeaders(allHeaders)
}

export default defineEventHandler(async (event) => {
  validateOrigin(event)

  const body = await readBody(event)
  const payload = validatePayload(body)
  const nitroApp = useNitroApp()
  const env = getEnvironment()

  const { service: _clientService, ...sanitizedPayload } = payload as IngestPayload & { service?: unknown }

  const wideEvent: WideEvent = {
    ...sanitizedPayload,
    ...env,
    source: 'client',
  }

  const headers = getSafeHeaders(event)
  const request = { method: 'POST' as const, path: event.path }

  try {
    await nitroApp.hooks.callHook('evlog:enrich', {
      event: wideEvent,
      request,
      headers,
      response: { status: 204 },
    })
  } catch (err) {
    console.error('[evlog] enrich failed:', err)
  }

  const drainPromise = nitroApp.hooks.callHook('evlog:drain', {
    event: wideEvent,
    request,
    headers,
  }).catch((err) => {
    console.error('[evlog] drain failed:', err)
  })

  // Use waitUntil if available (Cloudflare Workers, Vercel Edge)
  const waitUntilCtx = (event as unknown as { context: Record<string, unknown> }).context
  const cfCtx = (waitUntilCtx as { cloudflare?: { context?: { waitUntil?: (p: Promise<unknown>) => void } } }).cloudflare?.context ?? waitUntilCtx
  if (typeof (cfCtx as { waitUntil?: unknown }).waitUntil === 'function') {
    (cfCtx as { waitUntil: (p: Promise<unknown>) => void }).waitUntil(drainPromise)
  }

  setResponseStatus(event, 204)
  return null
})
