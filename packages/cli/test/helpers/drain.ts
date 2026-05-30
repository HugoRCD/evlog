import { vi, expect } from 'vitest'
import type { DrainContext, WideEvent } from 'evlog'

export function createDrainSpy() {
  return vi.fn<(ctx: DrainContext) => void | Promise<void>>()
}

export async function waitForDrainCalls(
  drainFn: ReturnType<typeof createDrainSpy>,
  count = 1,
  timeout = 1000,
): Promise<void> {
  await vi.waitFor(
    () => expect(drainFn.mock.calls.length).toBeGreaterThanOrEqual(count),
    { timeout, interval: 5 },
  )
}

export function findEventViaDrain(
  drainFn: ReturnType<typeof createDrainSpy>,
  predicate: (event: WideEvent) => boolean,
): WideEvent | undefined {
  for (const [ctx] of drainFn.mock.calls) {
    if (ctx?.event && predicate(ctx.event)) return ctx.event
  }
  return undefined
}
