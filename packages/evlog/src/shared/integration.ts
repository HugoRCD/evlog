import type { AsyncLocalStorage } from 'node:async_hooks'
import type { RequestLogger } from '../types'
import { attachForkToLogger } from './fork'
import { extractSafeHeaders, extractSafeNodeHeaders } from './headers'
import type { BaseEvlogOptions, MiddlewareLoggerOptions, MiddlewareLoggerResult } from './middleware'
import { createMiddlewareLogger } from './middleware'

/**
 * Request shape extracted from a framework-native context by
 * {@link FrameworkIntegrationSpec.extractRequest}.
 *
 * @beta Part of `evlog/toolkit`.
 */
export interface ExtractedRequest {
  method: string
  path: string
  /**
   * Either a Web `Headers` (Hono / Elysia / Fetch) or a Node-style
   * `IncomingHttpHeaders` record (Express / Fastify / Node).
   *
   * Pass whichever is native to your framework — `defineFrameworkIntegration`
   * filters it through {@link extractSafeHeaders} or {@link extractSafeNodeHeaders}.
   */
  headers?: Headers | Record<string, string | string[] | undefined>
  /** Optional request-id (used as-is when present, otherwise auto-generated). */
  requestId?: string
}

/**
 * Manifest passed to {@link defineFrameworkIntegration}.
 *
 * @beta Part of `evlog/toolkit`.
 */
export interface FrameworkIntegrationSpec<TCtx> {
  /** Stable identifier (used in logs and storage error messages). */
  name: string
  /** Extract method/path/requestId/headers from the framework context. */
  extractRequest: (ctx: TCtx) => ExtractedRequest
  /** Attach the request logger to the framework context (e.g. `c.set('log', logger)`). */
  attachLogger: (ctx: TCtx, logger: RequestLogger) => void
  /**
   * AsyncLocalStorage instance for `useLogger()`. Pass the result of
   * `createLoggerStorage(...)` for frameworks that need ALS-based access
   * (Express, Fastify, NestJS). Omit for frameworks where the logger is
   * accessed through the request context directly (Hono, Elysia).
   *
   * When provided, `defineFrameworkIntegration` automatically attaches
   * `log.fork()` to the per-request logger so users can spawn correlated
   * background work.
   */
  storage?: AsyncLocalStorage<RequestLogger>
  /**
   * Optional fork lifecycle hooks (only used when `storage` is set). Useful
   * for frameworks that track active loggers separately (e.g. Elysia's
   * `enterWith()` scoping).
   */
  forkLifecycle?: import('./fork').ForkLifecycle
}

/**
 * Result returned from {@link FrameworkIntegrationHelpers.start}.
 *
 * @beta Part of `evlog/toolkit`.
 */
export interface FrameworkRequestHandle extends MiddlewareLoggerResult {
  /**
   * Resolved middleware options used to create the logger. Useful when a host
   * needs to call other toolkit helpers (e.g. `attachForkToLogger`) with the
   * exact same options.
   */
  middlewareOptions: MiddlewareLoggerOptions
  /**
   * Run the framework's downstream handler inside the integration's storage
   * (if any). When no storage is configured, the callback is invoked directly.
   */
  runWith: <T>(fn: () => T | Promise<T>) => Promise<T>
}

/**
 * Helpers returned from {@link defineFrameworkIntegration}.
 *
 * @beta Part of `evlog/toolkit`.
 */
export interface FrameworkIntegrationHelpers<TCtx> {
  /**
   * Initialize the per-request middleware logger for a single framework
   * context. Returns `{ logger, finish, skipped, runWith }`.
   *
   * Hosts typically:
   * 1. Call `start(ctx, options)` at request entry
   * 2. Bail out early when `skipped === true`
   * 3. Run their handler inside `runWith(...)`
   * 4. Call `finish({ status })` on success or `finish({ error })` on failure
   */
  start: (ctx: TCtx, options?: BaseEvlogOptions) => FrameworkRequestHandle
}

function normalizeHeaders(headers: ExtractedRequest['headers']): Record<string, string> | undefined {
  if (!headers) return undefined
  if (typeof (headers as Headers).forEach === 'function' && typeof (headers as Headers).get === 'function') {
    return extractSafeHeaders(headers as Headers)
  }
  return extractSafeNodeHeaders(headers as Record<string, string | string[] | undefined>)
}

/**
 * Build a manifest-driven framework integration.
 *
 * Captures the boilerplate every middleware shares:
 * - request extraction (method, path, requestId, safe headers)
 * - `createMiddlewareLogger` setup
 * - logger attachment
 * - optional `AsyncLocalStorage` wrapping for `useLogger()`
 *
 * Each framework still owns its own middleware function (because the wire
 * shape — `(c, next)`, `(req, res, next)`, derive plugin, …  — varies), but
 * it only has to specify *what* to extract, *where* to attach, and *how* to
 * provide ALS — not *how* to run the lifecycle.
 *
 * @beta Part of `evlog/toolkit`.
 *
 * @example
 * ```ts
 * import { defineFrameworkIntegration } from 'evlog/toolkit'
 *
 * const integration = defineFrameworkIntegration<HonoContext>({
 *   name: 'hono',
 *   extractRequest: (c) => ({
 *     method: c.req.method,
 *     path: c.req.path,
 *     headers: c.req.raw.headers,
 *     requestId: c.req.header('x-request-id'),
 *   }),
 *   attachLogger: (c, logger) => c.set('log', logger),
 * })
 *
 * export function evlog(options?: BaseEvlogOptions): MiddlewareHandler {
 *   return async (c, next) => {
 *     const { skipped, finish, runWith } = integration.start(c, options)
 *     if (skipped) return next()
 *     try {
 *       await runWith(() => next())
 *       await finish({ status: c.res.status })
 *     } catch (error) {
 *       await finish({ error: error as Error })
 *       throw error
 *     }
 *   }
 * }
 * ```
 */
export function defineFrameworkIntegration<TCtx>(
  spec: FrameworkIntegrationSpec<TCtx>,
): FrameworkIntegrationHelpers<TCtx> {
  return {
    start(ctx, options = {}) {
      const extracted = spec.extractRequest(ctx)
      const headers = normalizeHeaders(extracted.headers)
      const middlewareOptions: MiddlewareLoggerOptions = {
        method: extracted.method,
        path: extracted.path,
        requestId: extracted.requestId || crypto.randomUUID(),
        headers,
        ...options,
      }
      const result = createMiddlewareLogger(middlewareOptions)

      if (!result.skipped) {
        if (spec.storage) {
          attachForkToLogger(spec.storage, result.logger, middlewareOptions, spec.forkLifecycle)
        }
        spec.attachLogger(ctx, result.logger)
      }

      const { storage } = spec
      const runWith = async <T>(fn: () => T | Promise<T>): Promise<T> => {
        if (!storage || result.skipped) {
          return await fn()
        }
        // `AsyncLocalStorage.run(store, fn)` returns whatever `fn` returns
        // (including a Promise) and propagates the store to every async
        // continuation that descends from `fn`. Awaiting that promise here
        // is enough — no extra Promise/microtask wrapping required.
        return await storage.run(result.logger, fn)
      }

      return { ...result, middlewareOptions, runWith }
    },
  }
}
