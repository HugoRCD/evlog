import type { DrainContext, EnrichContext, TailSamplingContext } from '../types'
import type { EvlogPlugin } from './plugin'

/**
 * Compose enricher callbacks into one. Runs in registration order; errors are
 * caught per-callback so one buggy enricher never blocks the others.
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
 * Fan out to multiple drains concurrently (`Promise.allSettled`). A slow
 * Sentry drain never blocks an Axiom drain on the same event.
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
 * Compose tail-sampling `keep` callbacks. `ctx.shouldKeep` is true after the
 * run if any callback set it. Errors are isolated.
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

/** Merge plugin lists. Later registrations override earlier ones by `name`. */
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
