import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { createRequestLogger, initLogger } from '../logger'
import type { RequestLogger, SamplingConfig, ServerEvent, TailSamplingContext } from '../types'
import { matchesPattern } from '../utils'

interface EvlogConfig {
  env?: Record<string, unknown>
  pretty?: boolean
  include?: string[]
  sampling?: SamplingConfig
}

function shouldLog(path: string, include?: string[]): boolean {
  // If no include patterns, log everything
  if (!include || include.length === 0) {
    return true
  }
  // Log only if path matches at least one include pattern
  return include.some(pattern => matchesPattern(path, pattern))
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

export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig()
  const evlogConfig = config.evlog as EvlogConfig | undefined

  initLogger({
    env: evlogConfig?.env,
    pretty: evlogConfig?.pretty,
    sampling: evlogConfig?.sampling,
  })

  nitroApp.hooks.hook('request', (event) => {
    const e = event as ServerEvent

    // Skip logging for routes not matching include patterns
    if (!shouldLog(e.path, evlogConfig?.include)) {
      return
    }

    // Store start time for duration calculation in tail sampling
    e.context._evlogStartTime = Date.now()

    const log = createRequestLogger({
      method: e.method,
      path: e.path,
      requestId: e.context.requestId || crypto.randomUUID(),
    })
    e.context.log = log
  })

  nitroApp.hooks.hook('error', async (error, { event }) => {
    const e = event as ServerEvent | undefined
    if (!e) return

    const log = e.context.log as RequestLogger | undefined
    if (log) {
      log.error(error as Error)

      // Get the actual error status code
      const errorStatus = (error as { statusCode?: number }).statusCode ?? 500
      log.set({ status: errorStatus })

      // Build tail sampling context
      const startTime = e.context._evlogStartTime as number | undefined
      const durationMs = startTime ? Date.now() - startTime : undefined

      const tailCtx: TailSamplingContext = {
        status: errorStatus,
        duration: durationMs,
        path: e.path,
        method: e.method,
        context: log.getContext(),
        shouldKeep: false,
      }

      // Call evlog:emit:keep hook
      await nitroApp.hooks.callHook('evlog:emit:keep', tailCtx)

      e.context._evlogEmitted = true

      // Emit immediately since afterResponse might not run on errors
      log.emit({ _forceKeep: tailCtx.shouldKeep })
    }
  })

  nitroApp.hooks.hook('afterResponse', async (event) => {
    const e = event as ServerEvent
    // Skip if already emitted by error hook
    if (e.context._evlogEmitted) return

    const log = e.context.log as RequestLogger | undefined
    if (log) {
      const status = getResponseStatus(e)
      log.set({ status })

      const startTime = e.context._evlogStartTime as number | undefined
      const durationMs = startTime ? Date.now() - startTime : undefined

      const tailCtx: TailSamplingContext = {
        status,
        duration: durationMs,
        path: e.path,
        method: e.method,
        context: log.getContext(),
        shouldKeep: false,
      }

      await nitroApp.hooks.callHook('evlog:emit:keep', tailCtx)

      log.emit({ _forceKeep: tailCtx.shouldKeep })
    }
  })
})
