import type { NitroApp } from 'nitropack/types'
import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { getHeaders } from 'h3'
import { createRequestLogger, initLogger, isEnabled } from '../logger'
import type { EnrichContext, RequestLogger, RouteConfig, SamplingConfig, ServerEvent, TailSamplingContext, WideEvent } from '../types'
import { filterSafeHeaders, matchesPattern } from '../utils'

interface EvlogConfig {
  enabled?: boolean
  env?: Record<string, unknown>
  pretty?: boolean
  include?: string[]
  exclude?: string[]
  routes?: Record<string, RouteConfig>
  sampling?: SamplingConfig
}

function shouldLog(path: string, include?: string[], exclude?: string[]): boolean {
  // Check exclusions first (they take precedence)
  if (exclude && exclude.length > 0) {
    if (exclude.some(pattern => matchesPattern(path, pattern))) {
      return false
    }
  }

  // If no include patterns, log everything (that wasn't excluded)
  if (!include || include.length === 0) {
    return true
  }

  // Log only if path matches at least one include pattern
  return include.some(pattern => matchesPattern(path, pattern))
}

/**
 * Find the service name for a given path based on route patterns.
 *
 * When multiple patterns match the same path, the first matching pattern wins
 * based on object iteration order. To ensure predictable behavior, order your
 * route patterns from most specific to most general.
 *
 * @param path - The request path to match
 * @param routes - Route configuration mapping patterns to service names
 * @returns The service name for the matching route, or undefined if no match
 *
 * @example
 * ```ts
 * // Good: specific patterns first, general patterns last
 * routes: {
 *   '/api/auth/admin/**': { service: 'admin-service' },
 *   '/api/auth/**': { service: 'auth-service' },
 *   '/api/**': { service: 'api-service' },
 * }
 * ```
 */
function getServiceForPath(path: string, routes?: Record<string, RouteConfig>): string | undefined {
  if (!routes) return undefined

  for (const [pattern, config] of Object.entries(routes)) {
    if (matchesPattern(path, pattern)) {
      return config.service
    }
  }

  return undefined
}

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

  // Use waitUntil if available (Cloudflare Workers, Vercel Edge)
  // This ensures drains complete before the runtime terminates
  const waitUntilCtx = event.context.cloudflare?.context ?? event.context
  if (typeof waitUntilCtx?.waitUntil === 'function') {
    waitUntilCtx.waitUntil(drainPromise)
  }
}

export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig()
  const evlogConfig = config.evlog as EvlogConfig | undefined

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

      // Get the actual error status code
      const errorStatus = (error as { statusCode?: number }).statusCode ?? 500
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
