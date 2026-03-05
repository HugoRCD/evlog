import { vi, expect } from 'vitest'
import type { DrainContext, EnrichContext, TailSamplingContext, WideEvent } from '../../src/types'

/**
 * Create mock callbacks for drain/enrich/keep.
 * Reusable across all framework integration tests.
 */
export function createPipelineSpies() {
  return {
    drain: vi.fn<[DrainContext], void | Promise<void>>(),
    enrich: vi.fn<[EnrichContext], void | Promise<void>>(),
    keep: vi.fn<[TailSamplingContext], void | Promise<void>>(),
  }
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
