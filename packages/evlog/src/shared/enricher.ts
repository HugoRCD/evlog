import type { EnrichContext, WideEvent } from '../types'
import { mergeEventField } from './event'

/**
 * Options accepted by every built-in enricher and any enricher built with
 * {@link defineEnricher}.
 *
 * @beta Part of `evlog/toolkit`.
 */
export interface EnricherOptions {
  /**
   * When `true`, replace any existing field on the event with the computed
   * value. Defaults to `false` so user-provided context (e.g. via
   * `log.set({ geo: ... })`) wins.
   */
  overwrite?: boolean
}

/**
 * Definition passed to {@link defineEnricher}.
 *
 * @beta Part of `evlog/toolkit`.
 */
export interface EnricherDefinition<T extends object> {
  /** Stable identifier used in error logs. */
  name: string
  /**
   * Top-level event field this enricher writes into. When provided, the value
   * returned by `compute` is merged into `event[field]` using
   * {@link mergeEventField}; pass `undefined` when the enricher writes
   * multiple top-level fields and handles its own merging.
   */
  field?: keyof WideEvent & string
  /**
   * Compute the value(s) to merge onto the event. Return `undefined` to
   * skip enrichment for this event (e.g. required header missing).
   *
   * When `field` is set, the returned object is merged onto `event[field]`.
   * When `field` is omitted, the enricher must mutate `ctx.event` directly
   * inside the same callback (use `defineEnricher` only for the boilerplate
   * removal in that case).
   */
  compute: (ctx: EnrichContext) => T | undefined
}

/**
 * Build an enricher with the canonical evlog conventions:
 *
 * - skips enrichment when `compute` returns `undefined`
 * - merges the result with {@link mergeEventField}, respecting `overwrite`
 * - isolates errors and logs them under `[evlog/{name}]`
 *
 * @beta Part of `evlog/toolkit` — recommended base for community enrichers.
 *
 * @example
 * ```ts
 * import { defineEnricher, getHeader } from 'evlog/toolkit'
 *
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
