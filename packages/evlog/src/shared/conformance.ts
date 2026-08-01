/**
 * Shared conformance checks for evlog's **middleware-shaped** integrations.
 *
 * @internal Not exported from `evlog/toolkit`. The checks are runner-agnostic
 * (they throw rather than calling `expect`) so the repo's Vitest matrix is a
 * thin binding over them, but the mount contract is not a public API.
 *
 * ## What this does not cover
 *
 * `mount()` injects `drain` as a **function**, which only works for
 * integrations configured per request — Hono, Express, Elysia, Fastify,
 * NestJS, oRPC, React Router, SvelteKit, Next, Workers.
 *
 * `evlog/nitro`, `evlog/nitro/v3` and `evlog/nuxt` receive their drain through
 * the `evlog:drain` hook *inside a built app*, and a function cannot cross that
 * build boundary — driving them would mean writing the drain into a fixture and
 * rebuilding per check. They keep their own fixture-based tests. `evlog/eve` is
 * turn-based, not HTTP; `evlog/vite` is a build plugin.
 *
 * Before any of this is exported publicly it needs a sanity check that reports
 * "your mount is wrong" separately from "your integration breaks the contract"
 * — today a mount serving a 404 is reported as a conformance failure.
 */

import type { DrainContext, WideEvent } from '../types'
import type { BaseEvlogOptions } from './middleware'

/** A request the suite asks the integration to serve. */
export interface ConformanceRequest {
  /** HTTP method to fire. Defaults to `GET` when omitted. */
  method?: string
  /** Path to request — normally the app's own {@link ConformanceApp.route}. */
  path: string
  /** Request headers, e.g. the `x-request-id` the suite expects to be reused. */
  headers?: Record<string, string>
}

/** Path the suite drives when an app does not declare its own. */
export const DEFAULT_CONFORMANCE_ROUTE = '/api/users'

/** The mounted app under test. */
export interface ConformanceApp {
  /**
   * The instrumented route this app serves with a `200`.
   * Defaults to {@link DEFAULT_CONFORMANCE_ROUTE}.
   *
   * Declare it when your framework's routing makes `/api/users` awkward — the
   * suite drives whatever you put here instead of assuming a path.
   */
  route?: string
  /** Serve one request and report the response status. */
  fire: (request: ConformanceRequest) => Promise<{ status: number }>
  /** Tear down servers/listeners, if any. */
  cleanup?: () => void | Promise<void>
}

/**
 * Mount the integration with the given evlog options.
 *
 * The app must expose one instrumented route replying `200`. It defaults to
 * `/api/users`; return a `route` from the app to use a different one.
 */
export type ConformanceMount = (options: BaseEvlogOptions) => ConformanceApp | Promise<ConformanceApp>

/** One behaviour every integration must exhibit. */
export interface ConformanceCheck {
  /** Human-readable spec, used as the test name by the Vitest binding. */
  name: string
  /** Resolves when the behaviour holds; throws an `Error` describing the gap otherwise. */
  run: (mount: ConformanceMount) => Promise<void>
}

/** Outcome of a single check, as returned by {@link runIntegrationConformance}. */
export interface ConformanceResult {
  /** The {@link ConformanceCheck.name} this result belongs to. */
  name: string
  /** `true` when the behaviour held. */
  passed: boolean
  /** Why the check failed; absent when `passed` is `true`. */
  error?: Error
}

function fail(message: string): never {
  throw new Error(`[evlog/conformance] ${message}`)
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message)
}

/** Collects drained events without depending on a mocking library. */
function createCollector() {
  const events: WideEvent[] = []
  const order: string[] = []
  const drain = (ctx: DrainContext | DrainContext[]) => {
    order.push('drain')
    for (const one of Array.isArray(ctx) ? ctx : [ctx]) {
      if (one?.event) events.push(one.event)
    }
  }
  return { events, order, drain }
}

/**
 * Poll until `predicate` holds. Drains may be awaited, deferred through
 * `waitUntil`, or resolved on a later microtask depending on the integration,
 * so the suite never assumes synchronous delivery.
 */
async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  return predicate()
}

/**
 * Ask the integration which route it serves. Needed by the checks whose
 * *options* reference the path (`routes`, `exclude`), since those must be built
 * before the app under test is mounted.
 */
async function discoverRoute(mount: ConformanceMount): Promise<string> {
  const probe = await mount({})
  const route = probe.route ?? DEFAULT_CONFORMANCE_ROUTE
  await probe.cleanup?.()
  return route
}

async function withApp(
  mount: ConformanceMount,
  options: BaseEvlogOptions,
  fn: (app: ConformanceApp, route: string) => Promise<void>,
): Promise<void> {
  const app = await mount(options)
  try {
    await fn(app, app.route ?? DEFAULT_CONFORMANCE_ROUTE)
  } finally {
    await app.cleanup?.()
  }
}

/**
 * The contract. Each entry is independent and mounts its own app, so a failing
 * check never leaks state into the next one.
 */
export const integrationConformanceChecks: ConformanceCheck[] = [
  {
    name: 'emits a wide event carrying method, path, status, level and duration',
    run: async (mount) => {
      const { events, drain } = createCollector()
      await withApp(mount, { drain }, async (app, route) => {
        await app.fire({ method: 'GET', path: route })
        assert(await waitFor(() => events.length > 0), `no event was drained for GET ${route}`)

        const event = events.find(e => e.path === route)
        assert(event, `drained an event but none had path "${route}"`)
        assert(event.method === 'GET', `expected method "GET", got ${JSON.stringify(event.method)}`)
        assert(event.status === 200, `expected status 200, got ${JSON.stringify(event.status)}`)
        assert(event.level === 'info', `expected level "info", got ${JSON.stringify(event.level)}`)
        // `duration` is the human-formatted value the logger writes (e.g. "2ms").
        assert(event.duration !== undefined && event.duration !== '', 'event is missing `duration`')
      })
    },
  },
  {
    name: 'reuses an inbound x-request-id',
    run: async (mount) => {
      const { events, drain } = createCollector()
      await withApp(mount, { drain }, async (app, route) => {
        await app.fire({
          method: 'GET',
          path: route,
          headers: { 'x-request-id': 'conformance-request-id' },
        })
        assert(await waitFor(() => events.length > 0), 'no event was drained')

        const event = events.find(e => e.path === route)
        assert(event, `no event for ${route}`)
        assert(
          event.requestId === 'conformance-request-id',
          `expected requestId "conformance-request-id", got ${JSON.stringify(event.requestId)} — the integration should honour the inbound x-request-id header`,
        )
      })
    },
  },
  {
    name: 'applies per-route service overrides',
    run: async (mount) => {
      const target = await discoverRoute(mount)
      const { events, drain } = createCollector()
      await withApp(mount, { drain, routes: { [target]: { service: 'conformance-service' } } }, async (app, route) => {
        await app.fire({ method: 'GET', path: route })
        assert(await waitFor(() => events.length > 0), 'no event was drained')

        const event = events.find(e => e.path === route)
        assert(event, `no event for ${route}`)
        assert(
          event.service === 'conformance-service',
          `expected service "conformance-service", got ${JSON.stringify(event.service)}`,
        )
      })
    },
  },
  {
    name: 'skips routes matched by exclude',
    run: async (mount) => {
      const target = await discoverRoute(mount)
      const { events, drain } = createCollector()
      await withApp(mount, { drain, exclude: [target] }, async (app, route) => {
        const response = await app.fire({ method: 'GET', path: route })
        assert(
          response.status === 200,
          `an excluded route must still be served normally, got status ${response.status}`,
        )
        await waitFor(() => events.length > 0, 100)
        assert(
          events.length === 0,
          `expected no event for an excluded route, got ${events.length}`,
        )
      })
    },
  },
  {
    name: 'runs enrich before drain, with the response status',
    run: async (mount) => {
      const { events, order, drain } = createCollector()
      let enrichStatus: unknown
      const enrich = (ctx: { event: WideEvent; response?: { status?: number } }) => {
        order.push('enrich')
        enrichStatus = ctx.response?.status
        ctx.event.conformanceEnriched = true
      }

      await withApp(mount, { drain, enrich }, async (app, route) => {
        await app.fire({ method: 'GET', path: route })
        assert(await waitFor(() => events.length > 0), 'no event was drained')

        assert(order[0] === 'enrich', `expected enrich to run before drain, got order ${JSON.stringify(order)}`)
        const event = events.find(e => e.path === route)
        assert(event, `no event for ${route}`)
        assert(event.conformanceEnriched === true, 'enrich mutations did not reach the drained event')
        assert(enrichStatus === 200, `expected enrich to receive response.status 200, got ${JSON.stringify(enrichStatus)}`)
      })
    },
  },
]

/**
 * Run the whole contract against an integration and report per-check results.
 *
 * Never throws for a failing check — inspect the returned array. Use this to
 * drive the suite from a test runner, or as a standalone conformance report for
 * a community integration.
 *
 * @example
 * ```ts
 * import { runIntegrationConformance } from 'evlog/toolkit'
 * import { Hono } from 'hono'
 * import { evlog } from 'evlog/hono'
 *
 * const results = await runIntegrationConformance(async (options) => {
 *   const app = new Hono()
 *   app.use(evlog(options))
 *   app.get('/api/users', c => c.json({ users: [] }))
 *   return {
 *     fire: async ({ method, path, headers }) => {
 *       const res = await app.request(path, { method: method ?? 'GET', headers })
 *       return { status: res.status }
 *     },
 *   }
 * })
 *
 * console.table(results.map(r => ({ check: r.name, passed: r.passed })))
 * ```
 */
export async function runIntegrationConformance(mount: ConformanceMount): Promise<ConformanceResult[]> {
  const results: ConformanceResult[] = []
  for (const check of integrationConformanceChecks) {
    try {
      await check.run(mount)
      results.push({ name: check.name, passed: true })
    } catch (error) {
      results.push({
        name: check.name,
        passed: false,
        error: error instanceof Error ? error : new Error(String(error)),
      })
    }
  }
  return results
}
