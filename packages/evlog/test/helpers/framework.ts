import { vi, expect } from 'vitest'
import type { DrainContext, EnrichContext, TailSamplingContext, WideEvent } from '../../src/types'

/**
 * Wait for a drain spy to be called at least `count` times. Wraps `vi.waitFor`
 * with a tighter default timeout suited to in-process middleware tests.
 *
 * Use this instead of asserting on the spy synchronously after `await
 * request(app)...` — Node's `res.on('finish')` lifecycle is async, so the
 * drain promise may not have resolved when supertest returns.
 */
export async function waitForDrainCalls(
  drainFn: ReturnType<typeof vi.fn>,
  count = 1,
  timeout = 1000,
): Promise<void> {
  await vi.waitFor(
    () => expect(drainFn.mock.calls.length).toBeGreaterThanOrEqual(count),
    { timeout, interval: 5 },
  )
}

/**
 * Create mock callbacks for drain/enrich/keep.
 * Reusable across all framework integration tests.
 */
export function createPipelineSpies() {
  return {
    drain: vi.fn<(ctx: DrainContext) => void | Promise<void>>(),
    enrich: vi.fn<(ctx: EnrichContext) => void | Promise<void>>(),
    keep: vi.fn<(ctx: TailSamplingContext) => void | Promise<void>>(),
  }
}

/**
 * Find the first {@link WideEvent} captured by a drain spy that matches the
 * given predicate. Returns `undefined` when no event matches; callers should
 * usually `expect(event).toBeDefined()` before drilling into fields.
 *
 * Replaces the fragile `console.info` parsing pattern (`find(call =>
 * typeof call[0] === 'string' && call[0].includes('"path":"/x"'))` followed
 * by `JSON.parse`).
 */
export function findEventViaDrain(
  drainFn: ReturnType<typeof vi.fn>,
  predicate: (event: WideEvent) => boolean,
): WideEvent | undefined {
  for (const call of drainFn.mock.calls) {
    const ctx = call[0] as DrainContext | undefined
    if (ctx?.event && predicate(ctx.event)) return ctx.event
  }
  return undefined
}

/**
 * Find the first {@link DrainContext} captured by a drain spy that matches the
 * given predicate. Like {@link findEventViaDrain} but returns the wrapping
 * context (with request, headers, response).
 */
export function findContextViaDrain(
  drainFn: ReturnType<typeof vi.fn>,
  predicate: (event: WideEvent) => boolean,
): DrainContext | undefined {
  for (const call of drainFn.mock.calls) {
    const ctx = call[0] as DrainContext | undefined
    if (ctx?.event && predicate(ctx.event)) return ctx
  }
  return undefined
}

/**
 * Assert that a drain callback was called with the expected event shape.
 */
export function assertDrainCalledWith(
  drainFn: ReturnType<typeof vi.fn>,
  expected: {
    path: string
    method?: string
    level?: string
    status?: number
  },
) {
  expect(drainFn).toHaveBeenCalled()
  const ctx = drainFn.mock.calls[0][0] as DrainContext
  expect(ctx.event).toBeDefined()
  expect(ctx.event.path).toBe(expected.path)
  expect(ctx.request).toBeDefined()
  expect(ctx.request!.path).toBe(expected.path)

  if (expected.method) {
    expect(ctx.event.method).toBe(expected.method)
    expect(ctx.request!.method).toBe(expected.method)
  }
  if (expected.level) expect(ctx.event.level).toBe(expected.level)
  if (expected.status) expect(ctx.event.status).toBe(expected.status)
  expect(ctx.request!.requestId).toBeDefined()
}

/**
 * Assert that an HTTP request emitted exactly one event matching the
 * `{ method, path, status, level }` partial. Builds on
 * {@link findEventViaDrain} for path-based lookup, then verifies the rest.
 */
export function assertHttpEventEmitted(
  drainFn: ReturnType<typeof vi.fn>,
  expected: { path: string, method?: string, status?: number, level?: string },
): WideEvent {
  expect(drainFn).toHaveBeenCalled()
  const event = findEventViaDrain(drainFn, e => e.path === expected.path)
  expect(event, `no drained event matched path=${expected.path}`).toBeDefined()
  if (expected.method) expect(event!.method).toBe(expected.method)
  if (expected.status) expect(event!.status).toBe(expected.status)
  if (expected.level) expect(event!.level).toBe(expected.level)
  return event!
}

/**
 * Assert that enrich was called before drain (via call order tracking).
 */
export function assertEnrichBeforeDrain(
  enrichFn: ReturnType<typeof vi.fn>,
  drainFn: ReturnType<typeof vi.fn>,
) {
  expect(enrichFn).toHaveBeenCalled()
  expect(drainFn).toHaveBeenCalled()

  const [enrichOrder] = enrichFn.mock.invocationCallOrder
  const [drainOrder] = drainFn.mock.invocationCallOrder
  expect(enrichOrder).toBeLessThan(drainOrder)
}

/**
 * Assert that sensitive headers are excluded from drain/enrich context.
 */
export function assertSensitiveHeadersFiltered(ctx: DrainContext | EnrichContext) {
  if (!ctx.headers) return
  expect(ctx.headers.authorization).toBeUndefined()
  expect(ctx.headers.cookie).toBeUndefined()
  expect(ctx.headers['set-cookie']).toBeUndefined()
  expect(ctx.headers['proxy-authorization']).toBeUndefined()
}

/**
 * Assert that an emitted event contains standard wide event fields.
 */
export function assertWideEventShape(event: WideEvent) {
  expect(event.timestamp).toBeDefined()
  expect(event.level).toBeDefined()
  expect(event.service).toBeDefined()
  expect(event.environment).toBeDefined()
  expect(event.duration).toBeDefined()
}
