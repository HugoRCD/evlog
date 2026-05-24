import { expect } from 'vitest'
import type { DrainContext } from '../../src/types'

/**
 * Vitest assertion + type narrowing — replaces `value!` after
 * `expect(value).toBeDefined()`.
 */
export function defined<T>(value: T | null | undefined, label?: string): T {
  expect(value, label).toBeDefined()
  if (value === null || value === undefined) throw new Error(label ?? 'expected defined value')
  return value
}

/**
 * Extract the first argument from a Vitest mock call as {@link DrainContext}.
 * Encapsulates the single cast needed for untyped `mock.calls` entries.
 */
export function getDrainCallArg(call: unknown[]): DrainContext {
  return defined(call[0], 'drain mock call arg') as DrainContext
}
