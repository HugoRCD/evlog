import type { DrainContext, WideEvent } from '../../src/types'

/**
 * Build a minimal valid WideEvent. Tests pass `id` to disambiguate fanouts;
 * any other field can be overridden via `overrides`.
 */
export function makeEvent(id: number, overrides?: Partial<WideEvent>): WideEvent {
  return {
    timestamp: '2026-01-01T00:00:00.000Z',
    level: 'info',
    service: 'test',
    environment: 'test',
    id,
    ...overrides,
  }
}

/**
 * Build a wide event with realistic defaults for adapter tests (no `id`,
 * fixed timestamp). Use {@link makeEvent} when fanout disambiguation matters.
 */
export function makeWideEvent(overrides?: Partial<WideEvent>): WideEvent {
  return {
    timestamp: '2024-01-01T12:00:00.000Z',
    level: 'info',
    service: 'test-service',
    environment: 'test',
    ...overrides,
  }
}

/** Wrap a {@link makeEvent} into the DrainContext shape used by drains. */
export function makeContext(event: WideEvent): DrainContext {
  return { event }
}

/**
 * Build a populated `Error` for tests that need a stack and well-known shape.
 */
export function makeError(message = 'test error', overrides?: Partial<Error>): Error {
  const err = new Error(message)
  if (overrides) Object.assign(err, overrides)
  return err
}
