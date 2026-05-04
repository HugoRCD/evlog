/**
 * Helpers for building / mutating wide events from inside enrichers and adapters.
 *
 * @beta Part of `evlog/toolkit`.
 */

/**
 * Merge a computed value onto an existing event field, respecting an optional
 * `overwrite` flag. The default is "preserve user-provided data": if the
 * existing field is a non-empty object, computed properties fill in only the
 * missing keys; otherwise the computed value is set as-is.
 *
 * Used by every built-in enricher to keep `log.set({ geo: ... })` precedence
 * over an enricher's automatic detection.
 *
 * @beta Part of `evlog/toolkit`.
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

/**
 * Generic "JSON-friendly" attribute value used by OTLP, Sentry, Datadog, and
 * PostHog adapters when flattening a `WideEvent` into a list of typed attributes.
 *
 * @beta Part of `evlog/toolkit`.
 */
export type AttributeValueKind = 'string' | 'integer' | 'double' | 'boolean'

export interface TypedAttributeValue {
  value: string | number | boolean
  type: AttributeValueKind
}

/**
 * Convert an arbitrary JS value into a {@link TypedAttributeValue} for
 * downstream HTTP transport. Complex objects are JSON-serialized to a string.
 *
 * @beta Part of `evlog/toolkit`.
 */
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

/**
 * Convert a JS value into the OTLP `AnyValue` shape (a discriminated record
 * with `stringValue` / `intValue` / `boolValue`).
 *
 * @beta Part of `evlog/toolkit`.
 */
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
