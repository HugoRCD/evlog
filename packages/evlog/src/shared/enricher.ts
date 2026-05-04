import type { EnrichContext, WideEvent } from '../types'
import { mergeEventField } from './event'

export interface EnricherOptions {
  /**
   * Replace existing event fields with the computed value. Defaults to `false`
   * so user-provided context (e.g. `log.set({ geo: ... })`) wins.
   */
  overwrite?: boolean
}

export interface EnricherDefinition<T extends object> {
  /** Stable identifier used in error logs. */
  name: string
  /**
   * Top-level event field to merge into. Omit when the enricher writes to
   * multiple fields and handles its own merging inside `compute`.
   */
  field?: keyof WideEvent & string
  /** Return `undefined` to skip enrichment (e.g. when a required header is missing). */
  compute: (ctx: EnrichContext) => T | undefined
}

/**
 * Build an enricher: skips when `compute` returns `undefined`, merges with
 * {@link mergeEventField} respecting `overwrite`, and isolates errors under
 * `[evlog/{name}]`.
 *
 * @example
 * ```ts
 * export const tenantEnricher = defineEnricher<{ id: string }>({
 *   name: 'tenant',
 *   field: 'tenant',
 *   compute({ headers }) {
 *     const id = getHeader(headers, 'x-tenant-id')
 *     return id ? { id } : undefined
 *   },
 * })
 * ```
 */
export function defineEnricher<T extends object>(
  def: EnricherDefinition<T>,
  options: EnricherOptions = {},
): (ctx: EnrichContext) => void {
  const { name, field, compute } = def
  return (ctx) => {
    let computed: T | undefined
    try {
      computed = compute(ctx)
    } catch (err) {
      console.error(`[evlog/${name}] enrich failed:`, err)
      return
    }
    if (computed === undefined) return
    if (!field) return
    const target = ctx.event[field]
    ctx.event[field] = mergeEventField<T>(target, computed, options.overwrite)
  }
}
