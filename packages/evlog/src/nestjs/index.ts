import { AsyncLocalStorage } from 'node:async_hooks'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DrainContext, EnrichContext, RequestLogger, RouteConfig, TailSamplingContext } from '../types'
import { createMiddlewareLogger } from '../shared/middleware'
import { extractSafeNodeHeaders } from '../shared/headers'

const storage = new AsyncLocalStorage<RequestLogger>()

export interface EvlogNestJSOptions {
  /** Route patterns to include in logging (glob). If not set, all routes are logged */
  include?: string[]
  /** Route patterns to exclude from logging. Exclusions take precedence over inclusions */
  exclude?: string[]
  /** Route-specific service configuration */
  routes?: Record<string, RouteConfig>
  /**
   * Drain callback called with every emitted event.
   * Use with drain adapters (Axiom, OTLP, Sentry, etc.) or custom endpoints.
   */
  drain?: (ctx: DrainContext) => void | Promise<void>
  /**
   * Enrich callback called after emit, before drain.
   * Use to add derived context (geo, deployment info, user agent, etc.).
   */
  enrich?: (ctx: EnrichContext) => void | Promise<void>
  /**
   * Custom tail sampling callback.
   * Set `ctx.shouldKeep = true` to force-keep the log regardless of head sampling.
   */
  keep?: (ctx: TailSamplingContext) => void | Promise<void>
}

declare module 'http' {
  interface IncomingMessage {
    log: RequestLogger
  }
}

/**
 * Get the request-scoped logger from anywhere in the call stack.
 * Must be called inside a request handled by the `evlog()` middleware.
 *
 * @example
 * ```ts
 * import { useLogger } from 'evlog/nestjs'
 *
 * function findUser(id: string) {
 *   const log = useLogger()
 *   log.set({ user: { id } })
 * }
 * ```
 */
export function useLogger<T extends object = Record<string, unknown>>(): RequestLogger<T> {
  const logger = storage.getStore()
  if (!logger) {
    throw new Error(
      '[evlog] useLogger() was called outside of an evlog middleware context. '
      + 'Make sure app.use(evlog()) is called in your NestJS bootstrap.',
    )
  }
  return logger as RequestLogger<T>
}

/**
 * Create an evlog middleware for NestJS.
 *
 * Apply it in your `main.ts` bootstrap with `app.use()`:
 *
 * @example
 * ```ts
 * import { NestFactory } from '@nestjs/core'
 * import { initLogger } from 'evlog'
 * import { evlog } from 'evlog/nestjs'
 * import { createAxiomDrain } from 'evlog/axiom'
 *
 * initLogger({ env: { service: 'nestjs-api' } })
 *
 * const app = await NestFactory.create(AppModule)
 * app.use(evlog({
 *   drain: createAxiomDrain(),
 *   enrich: (ctx) => {
 *     ctx.event.region = process.env.FLY_REGION
 *   },
 * }))
 * await app.listen(3000)
 * ```
 */
export function evlog(options: EvlogNestJSOptions = {}): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const headers = extractSafeNodeHeaders(req.headers)
    const url = new URL(req.url || '/', 'http://localhost')

    const { logger, finish, skipped } = createMiddlewareLogger({
      method: req.method || 'GET',
      path: url.pathname,
      requestId: headers['x-request-id'] || crypto.randomUUID(),
      headers,
      ...options,
    })

    if (skipped) {
      next()
      return
    }

    req.log = logger

    res.on('finish', () => {
      finish({ status: res.statusCode }).catch(() => {})
    })

    storage.run(logger, () => next())
  }
}
