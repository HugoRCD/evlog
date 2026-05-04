import type { DrainContext, EnrichContext, TailSamplingContext } from '../types'
import type { EvlogPlugin } from './plugin'

/**
 * Compose multiple enricher callbacks into a single async enricher.
 *
 * Runs in registration order. Each enricher is wrapped in a try/catch and any
 * thrown error is logged with the optional `name` prefix — one buggy enricher
 * never blocks the others.
 *
 * @beta Part of `evlog/toolkit`.
 *
 * @example
 * ```ts
 * import { composeEnrichers, createUserAgentEnricher, createGeoEnricher } from 'evlog/toolkit'
 *
 * const enrich = composeEnrichers([
 *   createUserAgentEnricher(),
 *   createGeoEnricher(),
 *   (ctx) => { ctx.event.region = process.env.REGION },
 * ])
 *
 * app.use(evlog({ enrich }))
 * ```
 */
export function composeEnrichers(
  enrichers: Array<(ctx: EnrichContext) => void | Promise<void>>,
  options: { name?: string } = {},
): (ctx: EnrichContext) => Promise<void> {
  const label = options.name ?? 'compose-enrichers'
  return async (ctx) => {
    for (const enricher of enrichers) {
      try {
        await enricher(ctx)
      } catch (err) {
        console.error(`[evlog/${label}] enrich failed:`, err)
      }
    }
  }
}

/**
 * Compose multiple drain callbacks into a single fan-out drain.
 *
 * Drains are invoked concurrently via `Promise.allSettled` — a slow Sentry
 * drain never blocks an Axiom drain on the same event.
 *
 * @beta Part of `evlog/toolkit`.
 *
 * @example
 * ```ts
 * import { composeDrains } from 'evlog/toolkit'
 * import { createAxiomDrain } from 'evlog/axiom'
 * import { createSentryDrain } from 'evlog/sentry'
 *
 * const drain = composeDrains([
 *   createAxiomDrain(),
 *   createSentryDrain(),
 * ])
 *
 * initLogger({ drain })
 * ```
 */
export function composeDrains(
  drains: Array<(ctx: DrainContext) => void | Promise<void>>,
  options: { name?: string } = {},
): (ctx: DrainContext) => Promise<void> {
  const label = options.name ?? 'compose-drains'
  return async (ctx) => {
    if (drains.length === 0) return
    await Promise.allSettled(
      drains.map(async (drain) => {
        try {
          await drain(ctx)
        } catch (err) {
          console.error(`[evlog/${label}] drain failed:`, err)
        }
      }),
    )
  }
}

/**
 * Compose multiple tail-sampling `keep` callbacks. After all of them ran, the
 * resulting `ctx.shouldKeep` is true if any of them set it to true.
 *
 * Errors are isolated; a failing keeper does not interrupt the others.
 *
 * @beta Part of `evlog/toolkit`.
 */
export function composeKeep(
  keepers: Array<(ctx: TailSamplingContext) => void | Promise<void>>,
  options: { name?: string } = {},
): (ctx: TailSamplingContext) => Promise<void> {
  const label = options.name ?? 'compose-keep'
  return async (ctx) => {
    for (const keep of keepers) {
      try {
        await keep(ctx)
      } catch (err) {
        console.error(`[evlog/${label}] keep failed:`, err)
      }
    }
  }
}

/**
 * Merge multiple plugin lists into one, preserving registration order with
 * later registrations overriding earlier ones for the same `name`.
 *
 * @beta Part of `evlog/toolkit`.
 */
export function composePlugins(...lists: Array<EvlogPlugin[] | undefined>): EvlogPlugin[] {
  const merged = new Map<string, EvlogPlugin>()
  for (const list of lists) {
    if (!list) continue
    for (const plugin of list) {
      merged.set(plugin.name, plugin)
    }
  }
  return Array.from(merged.values())
}
