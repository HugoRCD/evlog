import type { DrainContext, WideEvent } from '../types'

export interface DrainOptions<TConfig> {
  name: string
  resolve: () => TConfig | null | Promise<TConfig | null>
  send: (events: WideEvent[], config: TConfig) => Promise<void>
}

/**
 * Build a drain callback for `evlog:drain` (or `initLogger({ drain })`).
 * The returned function is async so `resolve` can load Nitro runtime config; hosts typically attach
 * the resulting promise to `waitUntil` so the HTTP response is not blocked (see Nitro plugin).
 */
export function defineDrain<TConfig>(options: DrainOptions<TConfig>): (ctx: DrainContext | DrainContext[]) => Promise<void> {
  return async (ctx: DrainContext | DrainContext[]) => {
    const contexts = Array.isArray(ctx) ? ctx : [ctx]
    if (contexts.length === 0) return

    const config = await options.resolve()
    if (!config) return

    try {
      await options.send(contexts.map(c => c.event), config)
    } catch (error) {
      console.error(`[evlog/${options.name}] Failed to send events:`, error)
    }
  }
}
