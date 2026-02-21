import type { NitroApp } from 'nitropack/types'
// Import from specific subpaths to avoid the barrel 'nitropack/runtime' which
// re-exports from internal/app.mjs — that file imports #nitro-internal-virtual/*
// modules that only exist inside rollup builds and crash when loaded externally
// (nitropack dev loads plugins outside the bundle via Worker threads).
import { defineNitroPlugin } from 'nitropack/runtime/internal/plugin'
import { getHeaders } from 'h3'
import { createRequestLogger, initLogger, isEnabled } from '../logger'
import { shouldLog, getServiceForPath, extractErrorStatus } from '../nitro'
import type { EvlogConfig } from '../nitro'
import type { EnrichContext, RequestLogger, ServerEvent, TailSamplingContext, WideEvent } from '../types'
import { filterSafeHeaders } from '../utils'

function getSafeHeaders(event: ServerEvent): Record<string, string> {
  const allHeaders = getHeaders(event as Parameters<typeof getHeaders>[0])
  return filterSafeHeaders(allHeaders)
}

function getSafeResponseHeaders(event: ServerEvent): Record<string, string> | undefined {
  const headers: Record<string, string> = {}
  const nodeRes = event.node?.res as { getHeaders?: () => Record<string, unknown> } | undefined

  if (nodeRes?.getHeaders) {
    for (const [key, value] of Object.entries(nodeRes.getHeaders())) {
      if (value === undefined) continue
      headers[key] = Array.isArray(value) ? value.join(', ') : String(value)
    }
  }

  if (event.response?.headers) {
    event.response.headers.forEach((value, key) => {
      headers[key] = value
    })
  }

  if (Object.keys(headers).length === 0) return undefined
  return filterSafeHeaders(headers)
}

function getResponseStatus(event: ServerEvent): number {
  // Node.js style
  if (event.node?.res?.statusCode) {
    return event.node.res.statusCode
  }

  // Web Standard
  if (event.response?.status) {
    return event.response.status
  }

  // Context-based
  if (typeof event.context.status === 'number') {
    return event.context.status
  }

  return 200
}

function buildHookContext(event: ServerEvent): Omit<EnrichContext, 'event'> {
  const responseHeaders = getSafeResponseHeaders(event)
  return {
    request: { method: event.method, path: event.path },
    headers: getSafeHeaders(event),
    response: {
      status: getResponseStatus(event),
      headers: responseHeaders,
    },
  }
}

async function callEnrichAndDrain(
  nitroApp: NitroApp,
  emittedEvent: WideEvent | null,
  event: ServerEvent,
): Promise<void> {
  if (!emittedEvent) return

  const hookContext = buildHookContext(event)

  try {
    await nitroApp.hooks.callHook('evlog:enrich', { event: emittedEvent, ...hookContext })
  } catch (err) {
    console.error('[evlog] enrich failed:', err)
  }

  const drainPromise = nitroApp.hooks.callHook('evlog:drain', {
    event: emittedEvent,
    request: hookContext.request,
    headers: hookContext.headers,
  }).catch((err) => {
    console.error('[evlog] drain failed:', err)
  })

  // Use waitUntil if available (Cloudflare Workers, Vercel Edge, etc.)
  // This keeps the runtime alive for background work without blocking the response
  const waitUntilCtx = event.context.cloudflare?.context ?? event.context
  if (typeof waitUntilCtx?.waitUntil === 'function') {
    waitUntilCtx.waitUntil(drainPromise)
  } else {
    // Fallback: await drain to prevent lost logs in serverless environments
    // (e.g. Vercel Fluid Compute). Runs inside afterResponse so the HTTP
    // response is already sent — no impact on client latency.
    await drainPromise
  }
}

export default defineNitroPlugin(async (nitroApp) => {
  // Config resolution: process.env bridge first (always set by the module),
  // then lazy useRuntimeConfig() for production builds where env may not persist.
  let evlogConfig: EvlogConfig | undefined
  if (process.env.__EVLOG_CONFIG) {
    evlogConfig = JSON.parse(process.env.__EVLOG_CONFIG)
  } else {
    try {
      // nitropack/runtime/internal/config imports virtual modules —
      // only works inside rollup-bundled output (production builds).
      const { useRuntimeConfig } = await import('nitropack/runtime/internal/config')
      evlogConfig = (useRuntimeConfig() as Record<string, any>).evlog
    } catch {
      // Expected in dev mode — virtual modules unavailable outside rollup
    }
  }

  initLogger({
    enabled: evlogConfig?.enabled,
    env: evlogConfig?.env,
    pretty: evlogConfig?.pretty,
    sampling: evlogConfig?.sampling,
  })

  if (!isEnabled()) return

  nitroApp.hooks.hook('request', (event) => {
    const e = event as ServerEvent

    // Skip logging for routes not matching include/exclude patterns
    if (!shouldLog(e.path, evlogConfig?.include, evlogConfig?.exclude)) {
      return
    }

    // Store start time for duration calculation in tail sampling
    e.context._evlogStartTime = Date.now()

    let requestIdOverride: string | undefined = undefined
    if (globalThis.navigator?.userAgent === 'Cloudflare-Workers') {
      const cfRay = getSafeHeaders(e)?.['cf-ray']
      if (cfRay) requestIdOverride = cfRay
    }

    const requestLog = createRequestLogger({
      method: e.method,
      path: e.path,
      requestId: requestIdOverride || e.context.requestId || crypto.randomUUID(),
    })

    // Apply route-based service configuration if a matching route is found
    const routeService = getServiceForPath(e.path, evlogConfig?.routes)
    if (routeService) {
      requestLog.set({ service: routeService })
    }

    e.context.log = requestLog
  })

  nitroApp.hooks.hook('error', async (error, { event }) => {
    const e = event as ServerEvent | undefined
    if (!e) return

    const requestLog = e.context.log as RequestLogger | undefined
    if (requestLog) {
      requestLog.error(error as Error)

      const errorStatus = extractErrorStatus(error)
      requestLog.set({ status: errorStatus })

      // Build tail sampling context
      const startTime = e.context._evlogStartTime as number | undefined
      const durationMs = startTime ? Date.now() - startTime : undefined

      const tailCtx: TailSamplingContext = {
        status: errorStatus,
        duration: durationMs,
        path: e.path,
        method: e.method,
        context: requestLog.getContext(),
        shouldKeep: false,
      }

      // Call evlog:emit:keep hook
      await nitroApp.hooks.callHook('evlog:emit:keep', tailCtx)

      e.context._evlogEmitted = true

      const emittedEvent = requestLog.emit({ _forceKeep: tailCtx.shouldKeep })
      await callEnrichAndDrain(nitroApp, emittedEvent, e)
    }
  })

  nitroApp.hooks.hook('afterResponse', async (event) => {
    const e = event as ServerEvent
    // Skip if already emitted by error hook
    if (e.context._evlogEmitted) return

    const requestLog = e.context.log as RequestLogger | undefined
    if (requestLog) {
      const status = getResponseStatus(e)
      requestLog.set({ status })

      const startTime = e.context._evlogStartTime as number | undefined
      const durationMs = startTime ? Date.now() - startTime : undefined

      const tailCtx: TailSamplingContext = {
        status,
        duration: durationMs,
        path: e.path,
        method: e.method,
        context: requestLog.getContext(),
        shouldKeep: false,
      }

      await nitroApp.hooks.callHook('evlog:emit:keep', tailCtx)

      const emittedEvent = requestLog.emit({ _forceKeep: tailCtx.shouldKeep })
      await callEnrichAndDrain(nitroApp, emittedEvent, e)
    }
  })
})
