import { definePlugin } from 'nitro'
import { useRuntimeConfig } from 'nitro/runtime-config'
import type { CaptureError } from 'nitro/types'
import type { HTTPEvent } from 'nitro/h3'
import { parseURL } from 'ufo'
import { createRequestLogger, initLogger, isEnabled } from '../logger'
import { shouldLog, getServiceForPath, extractErrorStatus } from '../nitro'
import type { EvlogConfig } from '../nitro'
import type { EnrichContext, RequestLogger, TailSamplingContext, WideEvent } from '../types'
import { filterSafeHeaders } from '../utils'

// Nitro v3 doesn't fully export hook types yet
// https://github.com/nitrojs/nitro/blob/8882bc9e1dbf2d342e73097f22a2156f70f50575/src/types/runtime/nitro.ts#L48-L53
interface NitroV3Hooks {
  close: () => void
  error: CaptureError
  request: (event: HTTPEvent) => void | Promise<void>
  response: (res: Response, event: HTTPEvent) => void | Promise<void>
  'evlog:emit:keep': (ctx: TailSamplingContext) => void | Promise<void>
  'evlog:enrich': (ctx: EnrichContext) => void | Promise<void>
  'evlog:drain': (ctx: { event: WideEvent; request?: { method?: string; path: string; requestId?: string }; headers?: Record<string, string> }) => void | Promise<void>
}

type Hooks = {
  hook: <T extends keyof NitroV3Hooks>(name: T, listener: NitroV3Hooks[T]) => void
  callHook: <T extends keyof NitroV3Hooks>(name: T, ...args: Parameters<NitroV3Hooks[T]>) => Promise<void>
}

function getContext(event: HTTPEvent): Record<string, unknown> {
  if (!event.req.context) {
    event.req.context = {}
  }
  return event.req.context
}

function getSafeRequestHeaders(event: HTTPEvent): Record<string, string> {
  const headers: Record<string, string> = {}
  event.req.headers.forEach((value, key) => {
    headers[key] = value
  })
  return filterSafeHeaders(headers)
}

function getSafeResponseHeaders(res: Response): Record<string, string> | undefined {
  const headers: Record<string, string> = {}
  res.headers.forEach((value, key) => {
    headers[key] = value
  })
  if (Object.keys(headers).length === 0) return undefined
  return filterSafeHeaders(headers)
}

function buildHookContext(
  event: HTTPEvent,
  res?: Response,
): Omit<EnrichContext, 'event'> {
  const { pathname } = parseURL(event.req.url)
  const responseHeaders = res ? getSafeResponseHeaders(res) : undefined
  return {
    request: { method: event.req.method, path: pathname },
    headers: getSafeRequestHeaders(event),
    response: {
      status: res?.status ?? 200,
      headers: responseHeaders,
    },
  }
}

function callDrainHook(
  hooks: Hooks,
  emittedEvent: WideEvent | null,
  event: HTTPEvent,
  request: EnrichContext['request'],
  headers: EnrichContext['headers'],
): void {
  if (!emittedEvent) return
  let drainPromise: Promise<any> | undefined
  try {
    drainPromise = hooks.callHook('evlog:drain', {
      event: emittedEvent,
      request,
      headers,
    })
  } catch (err) {
    console.error('[evlog] drain failed:', err)
  }

  // Use waitUntil if available (srvx native — Cloudflare Workers, Vercel Edge, etc.)
  // This ensures drains complete before the runtime terminates
  if (drainPromise && typeof event.req.waitUntil === 'function') {
    event.req.waitUntil(drainPromise)
  }
}

async function callEnrichAndDrain(
  hooks: Hooks,
  emittedEvent: WideEvent | null,
  event: HTTPEvent,
  res?: Response,
): Promise<void> {
  if (!emittedEvent) return

  const hookContext = buildHookContext(event, res)

  try {
    await hooks.callHook('evlog:enrich', { event: emittedEvent, ...hookContext })
  } catch (err) {
    console.error('[evlog] enrich failed:', err)
  }

  callDrainHook(hooks, emittedEvent, event, hookContext.request, hookContext.headers)
}

/**
 * Nitro v3 plugin entry point.
 *
 * Usage in Nitro v3:
 * ```ts
 * // plugins/evlog.ts
 * export { default } from 'evlog/nitro/v3'
 * ```
 */
export default definePlugin((nitroApp) => {
  // In production builds the plugin is bundled and useRuntimeConfig()
  // resolves the virtual module correctly. In dev mode the plugin is
  // loaded externally so useRuntimeConfig() returns a stub — fall back
  // to the env var bridge set by the module.
  const evlogConfig = (useRuntimeConfig().evlog ?? (process.env.__EVLOG_CONFIG ? JSON.parse(process.env.__EVLOG_CONFIG) : undefined)) as EvlogConfig | undefined

  initLogger({
    enabled: evlogConfig?.enabled,
    env: evlogConfig?.env,
    pretty: evlogConfig?.pretty,
    sampling: evlogConfig?.sampling,
  })

  if (!isEnabled()) return

  const hooks = nitroApp.hooks as unknown as Hooks

  hooks.hook('request', (event) => {
    const { pathname } = parseURL(event.req.url)

    // Skip logging for routes not matching include/exclude patterns
    if (!shouldLog(pathname, evlogConfig?.include, evlogConfig?.exclude)) {
      return
    }

    const ctx = getContext(event)

    // Store start time for duration calculation in tail sampling
    ctx._evlogStartTime = Date.now()

    let requestIdOverride: string | undefined = undefined
    if (globalThis.navigator?.userAgent === 'Cloudflare-Workers') {
      const cfRay = event.req.headers.get('cf-ray')
      if (cfRay) requestIdOverride = cfRay
    }

    const log = createRequestLogger({
      method: event.req.method,
      path: pathname,
      requestId: requestIdOverride || ctx.requestId as string | undefined || crypto.randomUUID(),
    })

    // Apply route-based service configuration if a matching route is found
    const routeService = getServiceForPath(pathname, evlogConfig?.routes)
    if (routeService) {
      log.set({ service: routeService })
    }

    ctx.log = log
  })

  hooks.hook('response', async (res, event) => {
    const ctx = event.req.context
    // Skip if already emitted by error hook
    if (ctx?._evlogEmitted) return

    const log = ctx?.log as RequestLogger | undefined
    if (!log || !ctx) return

    const { status } = res
    log.set({ status })

    const startTime = ctx._evlogStartTime as number | undefined
    const durationMs = startTime ? Date.now() - startTime : undefined

    const { pathname } = parseURL(event.req.url)

    const tailCtx: TailSamplingContext = {
      status,
      duration: durationMs,
      path: pathname,
      method: event.req.method,
      context: log.getContext(),
      shouldKeep: false,
    }

    await hooks.callHook('evlog:emit:keep', tailCtx)

    const emittedEvent = log.emit({ _forceKeep: tailCtx.shouldKeep })
    await callEnrichAndDrain(hooks, emittedEvent, event, res)
  })

  hooks.hook('error', async (error, { event }) => {
    if (!event) return
    const e = event as HTTPEvent

    const ctx = e.req.context
    const log = ctx?.log as RequestLogger | undefined
    if (!log || !ctx) return

    // Check if error.cause is an EvlogError (thrown errors get wrapped in HTTPError by nitro)
    const actualError = (error.cause as Error)?.name === 'EvlogError' 
      ? error.cause as Error 
      : error as Error

    log.error(actualError)

    const errorStatus = extractErrorStatus(actualError)
    log.set({ status: errorStatus })

    const { pathname } = parseURL(e.req.url)
    const startTime = ctx._evlogStartTime as number | undefined
    const durationMs = startTime ? Date.now() - startTime : undefined

    const tailCtx: TailSamplingContext = {
      status: errorStatus,
      duration: durationMs,
      path: pathname,
      method: e.req.method,
      context: log.getContext(),
      shouldKeep: false,
    }

    await hooks.callHook('evlog:emit:keep', tailCtx)

    ctx._evlogEmitted = true

    const emittedEvent = log.emit({ _forceKeep: tailCtx.shouldKeep })
    await callEnrichAndDrain(hooks, emittedEvent, e)
  })
})
