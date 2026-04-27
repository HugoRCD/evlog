import { initLogger, createRequestLogger } from '../logger'
import type { LoggerConfig, RequestLogger } from '../types'

/**
 * Minimal Cloudflare Workers execution context (`fetch` third argument).
 * Matches Cloudflare `ExecutionContext` without requiring `@cloudflare/workers-types`.
 */
export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void
}

/**
 * Options for createWorkersLogger
 */
export interface WorkersLoggerOptions {
  /** Override the request ID (default: cf-ray header) */
  requestId?: string
  /** Headers to include in logs (default: none) */
  headers?: string[]
  /**
   * Cloudflare Workers `ExecutionContext` from the `fetch` handler
   * (`async fetch(request, env, ctx)`). When set, async `initLogger({ drain })`
   * work from `log.emit()` is registered with `ctx.waitUntil` so drains (HTTP to
   * Axiom, PostHog, etc.) complete after the response is returned.
   *
   * Prefer {@link defineWorkerFetch} when you want this wired automatically.
   */
  executionCtx?: WorkerExecutionContext
  /**
   * Lower-level alternative to `executionCtx`: same function Cloudflare assigns to
   * `ExecutionContext#waitUntil` (must be bound if you extract the method), e.g.
   * `waitUntil: ctx.waitUntil.bind(ctx)`.
   */
  waitUntil?: (promise: Promise<unknown>) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function collectHeaders(headers: Headers, include: string[] | undefined): Record<string, string> | undefined {
  if (!include || include.length === 0) return undefined

  const normalized = new Set(include.map(h => h.toLowerCase()))
  const result: Record<string, string> = {}

  headers.forEach((value, key) => {
    if (normalized.has(key.toLowerCase())) {
      result[key] = value
    }
  })

  return Object.keys(result).length > 0 ? result : undefined
}

/**
 * Initialize evlog for Cloudflare Workers.
 * Call once at module scope.
 *
 * @example
 * ```ts
 * initWorkersLogger({
 *   env: { service: 'my-api' },
 * })
 * ```
 */
export function initWorkersLogger(options: LoggerConfig = {}): void {
  initLogger({
    ...options,
    pretty: false,
    stringify: false,
  })
}

/**
 * Wraps a Workers `fetch` handler so {@link createWorkersLogger} receives
 * `executionCtx` automatically for async drains (`initWorkersLogger({ drain })`).
 *
 * Cloudflare does not expose `ExecutionContext` globally — only as the third
 * `fetch` argument — so evlog cannot discover it without either this helper or
 * an explicit `{ executionCtx: ctx }` / `waitUntil` option.
 *
 * @example
 * ```ts
 * initWorkersLogger({ env: { service: 'my-api' }, drain: myDrain })
 *
 * export default defineWorkerFetch(async (request, env, ctx, log) => {
 *   log.set({ route: '/health' })
 *   log.emit({ status: 200 })
 *   return new Response('ok')
 * })
 * ```
 */
export function defineWorkerFetch<TEnv = unknown>(
  handler: (
    request: Request,
    env: TEnv,
    ctx: WorkerExecutionContext,
    log: RequestLogger,
  ) => Response | Promise<Response>,
): {
  fetch: (request: Request, env: TEnv, ctx: WorkerExecutionContext) => Promise<Response>
} {
  return {
    fetch(request, env, ctx) {
      const log = createWorkersLogger(request, { executionCtx: ctx })
      return Promise.resolve(handler(request, env, ctx, log))
    },
  }
}

function pickCfContext(request: Request): Record<string, unknown> {
  const cf = Reflect.get(request, 'cf')
  if (!isRecord(cf)) return {}

  const out: Record<string, unknown> = {}
  if (typeof cf.colo === 'string') out.colo = cf.colo
  if (typeof cf.country === 'string') out.country = cf.country
  if (typeof cf.asn === 'number') out.asn = cf.asn
  return out
}

/**
 * Create a request-scoped logger for Cloudflare Workers.
 * Auto-extracts cf-ray, request.cf context, method, and path.
 *
 * @example
 * ```ts
 * export default {
 *   async fetch(request: Request, env: Env, ctx: ExecutionContext) {
 *     const log = createWorkersLogger(request, { executionCtx: ctx })
 *
 *     log.set({ user: { id: '123' } })
 *     log.emit({ status: 200 })
 *
 *     return new Response('ok')
 *   }
 * }
 * ```
 */
export function createWorkersLogger<T extends object = Record<string, unknown>>(request: Request, options: WorkersLoggerOptions = {}): RequestLogger<T> {
  const url = new URL(request.url)
  const cfRay = request.headers.get('cf-ray') ?? undefined
  const traceparent = request.headers.get('traceparent') ?? undefined

  const waitUntil =
    options.waitUntil
    ?? (options.executionCtx
      ? options.executionCtx.waitUntil.bind(options.executionCtx)
      : undefined)

  const log = createRequestLogger<T>({
    method: request.method,
    path: url.pathname,
    requestId: options.requestId ?? cfRay,
    waitUntil,
  })

  // Cast needed: CF-specific enrichment fields (cfRay, traceparent, etc.) aren't in user's T
  const untyped = log as unknown as RequestLogger
  untyped.set({
    cfRay,
    traceparent,
    ...pickCfContext(request),
    ...(options.headers ? { requestHeaders: collectHeaders(request.headers, options.headers) } : {}),
  })

  return log
}
