import { defineEventHandler, readValidatedBody } from 'h3'
import { useNitroApp } from 'nitropack/runtime'
import { z } from 'zod'
import type { IngestPayload, WideEvent } from '../../../../types'
import { getEnvironment } from '../../../../logger'

const ingestSchema = z.looseObject({
  timestamp: z.union([z.string(), z.number()]).transform((val) => {
    return typeof val === 'number' ? new Date(val).toISOString() : val
  }),
  level: z.enum(['info', 'error', 'warn', 'debug']),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody<IngestPayload>(event, ingestSchema.parse)
  const nitroApp = useNitroApp()
  const env = getEnvironment()

  const wideEvent: WideEvent = {
    ...env,
    ...body,
    source: 'client',
  }

  await nitroApp.hooks.callHook('evlog:drain', {
    event: wideEvent,
    request: { method: 'POST', path: '/api/_evlog/ingest' },
  })

  return null // 204 No Content
})
