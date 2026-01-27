import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { createRequestLogger, initLogger } from '../logger'
import type { RequestLogger, SamplingConfig, ServerEvent } from '../types'

interface EvlogConfig {
  env?: Record<string, unknown>
  pretty?: boolean
  include?: string[]
  sampling?: SamplingConfig
}

function matchesPattern(path: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars except * and ?
    .replace(/\*\*/g, '{{GLOBSTAR}}') // Temp placeholder for **
    .replace(/\*/g, '[^/]*') // * matches anything except /
    .replace(/{{GLOBSTAR}}/g, '.*') // ** matches anything including /
    .replace(/\?/g, '[^/]') // ? matches single char except /

  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(path)
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

    const log = createRequestLogger({
      method: e.method,
      path: e.path,
      requestId: e.context.requestId || crypto.randomUUID(),
    })
    e.context.log = log
  })

  nitroApp.hooks.hook('afterResponse', (event) => {
    const e = event as ServerEvent
    const log = e.context.log as RequestLogger | undefined
    if (log) {
      log.set({ status: getResponseStatus(e) })
      log.emit()
    }
  })

  nitroApp.hooks.hook('error', (error, { event }) => {
    const e = event as ServerEvent | undefined
    const log = e?.context.log as RequestLogger | undefined
    if (log) {
      log.error(error as Error)
    }
  })
})
