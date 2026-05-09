import { createError, defineEventHandler, getHeader, getQuery, getRequestHost, setResponseHeaders } from 'h3'
import type { WideEvent } from '../../../../types'
import { getDefaultStream } from '../../../../stream'
import { EVLOG_VERSION } from '../../../../shared/http'
import { resolveEvlogConfigForNitroPlugin } from '../../../../shared/nitroConfigBridge'

/**
 * Server-Sent Events bridge for the in-process default stream drain.
 *
 * Designed for local development and long-lived self-hosted servers — the
 * stream lives inside one process. On serverless platforms (Vercel
 * Functions, Cloudflare Workers, Lambda) each invocation is isolated, so a
 * subscriber on one isolate never sees events emitted from another one;
 * there the bridge effectively just observes the current invocation.
 */

interface ResolvedStreamConfig {
  token?: string
  heartbeatMs: number
  buffer: number
}

async function resolveStreamConfig(): Promise<ResolvedStreamConfig | null> {
  const evlog = (await resolveEvlogConfigForNitroPlugin()) as
    | { transport?: { stream?: { enabled?: boolean; token?: string; heartbeatMs?: number; buffer?: number } } }
    | undefined
  const stream = evlog?.transport?.stream
  if (!stream || stream.enabled !== true) return null
  return {
    token: typeof stream.token === 'string' ? stream.token : undefined,
    heartbeatMs: typeof stream.heartbeatMs === 'number' ? stream.heartbeatMs : 15_000,
    buffer: typeof stream.buffer === 'number' ? stream.buffer : 500,
  }
}

function isLocalHost(host: string | undefined): boolean {
  if (!host) return false
  const lower = host.toLowerCase()
  return lower.startsWith('localhost') || lower.startsWith('127.0.0.1') || lower.startsWith('[::1]')
}

function envelope(type: 'event' | 'replay' | 'hello', data: unknown): string {
  return `data: ${JSON.stringify({ evlog: '1', type, data })}\n\n`
}

export default defineEventHandler(async (event) => {
  const config = await resolveStreamConfig()
  if (!config) {
    throw createError({ statusCode: 404, message: 'evlog stream is not enabled' })
  }

  if (config.token) {
    const auth = getHeader(event, 'authorization')
    if (auth !== `Bearer ${config.token}`) {
      throw createError({ statusCode: 401, message: 'Unauthorized' })
    }
  } else {
    const host = getRequestHost(event)
    const origin = getHeader(event, 'origin')
    if (!isLocalHost(host) && origin) {
      let originHost: string | null = null
      try {
        originHost = new URL(origin).host
      } catch {
        originHost = null
      }
      if (originHost !== host) {
        throw createError({ statusCode: 403, message: 'Invalid origin' })
      }
    }
  }

  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'X-Evlog-Version': EVLOG_VERSION,
  })

  const stream = getDefaultStream({ buffer: config.buffer })
  const { res } = event.node

  res.write(envelope('hello', {
    evlogVersion: EVLOG_VERSION,
    bufferSize: config.buffer,
    heartbeatMs: config.heartbeatMs,
  }))

  const query = getQuery(event)
  const sinceRaw = typeof query.since === 'string' ? query.since : undefined
  const sinceMs = sinceRaw ? Date.parse(sinceRaw) : Number.NaN
  if (Number.isFinite(sinceMs)) {
    for (const past of stream.recent()) {
      const ts = typeof past.timestamp === 'string' ? Date.parse(past.timestamp) : Number.NaN
      if (Number.isFinite(ts) && ts >= sinceMs) {
        res.write(envelope('replay', past))
      }
    }
  }

  let closed = false

  const unsubscribe = stream.subscribe((wideEvent: WideEvent) => {
    if (closed) return
    res.write(envelope('event', wideEvent))
  })

  const heartbeat = setInterval(() => {
    if (closed) return
    res.write(`event: ping\ndata: ${JSON.stringify({ evlog: '1', type: 'ping', data: { t: Date.now() } })}\n\n`)
  }, config.heartbeatMs)

  const cleanup = () => {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    unsubscribe()
    try {
      res.end()
    } catch {
      // noop
    }
  }

  event.node.req.on('close', cleanup)
  event.node.req.on('error', cleanup)
  event.node.res.on('close', cleanup)
  event.node.res.on('error', cleanup)

  return new Promise<void>(() => {
    // Resolves when the connection closes — h3 keeps the response open.
  })
})
