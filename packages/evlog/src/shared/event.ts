/**
 * Helpers for building / mutating wide events from inside enrichers and adapters.
 */

/**
 * Merge a computed value onto an existing event field. By default, existing
 * object values win over computed ones — so `log.set({ geo: ... })` keeps
 * precedence over an enricher's automatic detection.
 */
export function mergeEventField<T extends object>(
  existing: unknown,
  computed: T,
  overwrite?: boolean,
): T {
  if (overwrite || existing === undefined || existing === null || typeof existing !== 'object') {
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
