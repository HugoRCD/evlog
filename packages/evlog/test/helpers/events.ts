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

/** Wrap a {@link makeEvent} into the DrainContext shape used by drains. */
export function makeContext(event: WideEvent): DrainContext {
  return { event }
}
