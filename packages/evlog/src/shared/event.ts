/**
 * Helpers for building / mutating wide events from inside enrichers and adapters.
 */

import type { WideEvent } from '../types'

/**
 * One-line summary of a wide event — `POST /api/checkout (500)`.
 *
 * Limited to the request shape and its outcome: `method`, `path`, `status`.
 * Returns an empty string when the event carries none of them, leaving the
 * caller to pick its own fallback.
 */
export function formatEventSummary(event: WideEvent): string {
  const method = typeof event.method === 'string' ? event.method : ''
  const path = typeof event.path === 'string' ? event.path : ''
  const status = typeof event.status === 'number' ? event.status : undefined

  const head = [method, path].filter(part => part.length > 0).join(' ')
  if (head) return status !== undefined ? `${head} (${status})` : head
  return status !== undefined ? `(${status})` : ''
}

/**
 * Merge a computed value onto an existing event field. By default, existing
 * object values win over computed ones — so `log.set({ geo: ... })` keeps
 * precedence over an enricher's automatic detection.
 */
export function mergeEventField<T>(
  existing: unknown,
  computed: T,
  overwrite?: boolean,
): T {
  if (overwrite) return computed
  if (typeof computed !== 'object' || computed === null) {
    return existing === undefined || existing === null ? computed : existing as T
  }
  if (existing === undefined || existing === null || typeof existing !== 'object') {
    return computed
  }
  return { ...computed, ...(existing as T) }
}

/** Typed attribute used when flattening events for OTLP/Sentry/Datadog/PostHog. */
export type AttributeValueKind = 'string' | 'integer' | 'double' | 'boolean'

export interface TypedAttributeValue {
  value: string | number | boolean
  type: AttributeValueKind
}

/** Convert a JS value to a {@link TypedAttributeValue}. Objects are JSON-serialized. */
export function toTypedAttributeValue(value: unknown): TypedAttributeValue | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') return { value, type: 'string' }
  if (typeof value === 'boolean') return { value, type: 'boolean' }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { value, type: 'integer' }
    return { value, type: 'double' }
  }
  return { value: JSON.stringify(value), type: 'string' }
}

/** Convert a JS value to the OTLP `AnyValue` shape (`stringValue` / `intValue` / `boolValue`). */
export function toOtlpAttributeValue(value: unknown): {
  stringValue?: string
  intValue?: string
  boolValue?: boolean
} {
  if (typeof value === 'boolean') return { boolValue: value }
  if (typeof value === 'number' && Number.isInteger(value)) return { intValue: String(value) }
  if (typeof value === 'string') return { stringValue: value }
  return { stringValue: JSON.stringify(value) }
}
