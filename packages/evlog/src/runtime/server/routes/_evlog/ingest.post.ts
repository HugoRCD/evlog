import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { useNitroApp } from 'nitropack/runtime'
import type { IngestPayload, WideEvent } from '../../../../types'
import { getEnvironment } from '../../../../logger'

const VALID_LEVELS = ['info', 'error', 'warn', 'debug'] as const

function validatePayload(body: unknown): IngestPayload {
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, message: 'Invalid request body' })
  }

  const payload = body as Record<string, unknown>

  if (payload.timestamp === undefined || payload.timestamp === null) {
    throw createError({ statusCode: 400, message: 'Missing required field: timestamp' })
  }

  const { timestamp: rawTimestamp } = payload
  let timestamp: string
  if (typeof rawTimestamp === 'number') {
    timestamp = new Date(rawTimestamp).toISOString()
  } else if (typeof rawTimestamp === 'string') {
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

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const payload = validatePayload(body)
  const nitroApp = useNitroApp()
  const env = getEnvironment()

  const wideEvent: WideEvent = {
    ...payload,
    ...env,
    source: 'client',
  }

  try {
    await nitroApp.hooks.callHook('evlog:drain', {
      event: wideEvent,
      request: { method: 'POST', path: event.path },
    })
  } catch {
    // Silently fail - don't break the client
  }

  setResponseStatus(event, 204)
  return null
})
