import { describe, expect, it } from 'vitest'
import type { BaseEvlogOptions } from '../../src/shared/middleware'
import { assertHttpEventEmitted, createPipelineSpies, findEventViaDrain, waitForDrainCalls } from './framework'
import { defined } from './defined'

/**
 * Minimal viable surface every framework adapter must expose for the shared
 * matrix to drive it. Keep this small — the matrix is best-effort coverage of
 * the *truly identical* specs across all frameworks; framework-specific tests
 * (Elysia status, Hono throw paths, SvelteKit hooks, NestJS module API,
 * Next instrumentation, Fastify inject semantics) live in their own files.
 */
export interface FrameworkAdapter {
  name: string
  /**
   * Build a fresh app + a `fire` function for that app. The adapter owns the
   * mounting (via `app.use`, `register`, `c.use`, ...) and translates a
   * `{ method, path, headers }` request shape to its native firing API.
   *
   * The single GET route at `/api/users` returns `{ users: [] }` with status
   * 200; tests use other paths only when relevant (e.g. include/exclude).
   */
  mount: (options: BaseEvlogOptions) => Promise<{
    fire: (req: { method?: string, path: string, headers?: Record<string, string> }) => Promise<{ status: number }>
    cleanup?: () => Promise<void>
  }>
}

/**
 * Run the shared HTTP middleware spec against a framework adapter. Asserts
 * via injected drain spy (never `console.info` parsing) so semantics are
 * portable across Express, Hono, Elysia, Fastify, NestJS, SvelteKit, and
 * react-router.
 *
 * Use under a top-level `describe('evlog/<framework>', ...)` inside each
 * framework test file to anchor the framework-specific blocks alongside.
 *
 * @example
 * ```ts
 * describeStandardHttpMatrix({
 *   name: 'express',
 *   async mount(options) {
 *     const app = express()
 *     app.use(evlog(options))
 *     app.get('/api/users', (_req, res) => res.json({ users: [] }))
 *     return {
 *       async fire(req) {
 *         const r = await request(app)[req.method?.toLowerCase() || 'get'](req.path).set(req.headers || {})
 *         return { status: r.status }
 *       },
 *     }
 *   },
 * })
 * ```
 */
export function describeStandardHttpMatrix(adapter: FrameworkAdapter): void {
  describe(`shared http matrix (${adapter.name})`, () => {
    it('drains an event with method, path, status, level', async () => {
      const { drain } = createPipelineSpies()
      const { fire, cleanup } = await adapter.mount({ drain })
      try {
        await fire({ method: 'GET', path: '/api/users' })
        await waitForDrainCalls(drain)
        const event = assertHttpEventEmitted(drain, {
          path: '/api/users',
          method: 'GET',
          status: 200,
          level: 'info',
        })
        expect(event.duration).toBeDefined()
      } finally {
        await cleanup?.()
      }
    })

    it('preserves x-request-id when provided', async () => {
      const { drain } = createPipelineSpies()
      const { fire, cleanup } = await adapter.mount({ drain })
      try {
        await fire({ method: 'GET', path: '/api/users', headers: { 'x-request-id': 'shared-matrix-id' } })
        await waitForDrainCalls(drain)
        const event = defined(
          findEventViaDrain(drain, e => e.path === '/api/users'),
          'event with x-request-id',
        )
        expect(event.requestId).toBe('shared-matrix-id')
      } finally {
        await cleanup?.()
      }
    })

    it('honors per-route service overrides', async () => {
      const { drain } = createPipelineSpies()
      const { fire, cleanup } = await adapter.mount({
        drain,
        routes: { '/api/**': { service: 'matrix-service' } },
      })
      try {
        await fire({ method: 'GET', path: '/api/users' })
        await waitForDrainCalls(drain)
        const event = defined(
          findEventViaDrain(drain, e => e.path === '/api/users'),
          'event with service override',
        )
        expect(event.service).toBe('matrix-service')
      } finally {
        await cleanup?.()
      }
    })
  })
}
