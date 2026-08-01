import { describe, it } from 'vitest'
import type { ConformanceMount } from '../../src/shared/conformance'
import { integrationConformanceChecks } from '../../src/shared/conformance'

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
   * 200; checks use other paths only when relevant (e.g. exclude).
   */
  mount: ConformanceMount
}

/**
 * Run the shared HTTP middleware spec against a framework adapter.
 *
 * The specs themselves live in `src/shared/conformance.ts` and ship in
 * `evlog/toolkit`, so community integrations can assert the same contract from
 * outside this repo. This helper is only the Vitest binding: it turns each
 * check into an `it()`.
 *
 * Assertions go through an injected drain (never `console.info` parsing) so
 * semantics stay portable across every integration.
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
    for (const check of integrationConformanceChecks) {
      it(check.name, async () => {
        await check.run(adapter.mount)
      })
    }
  })
}
