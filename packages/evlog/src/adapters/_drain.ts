import type { DrainContext, WideEvent } from '../types'

export interface DrainOptions<TConfig> {
  name: string
  resolve: () => TConfig | null
  send: (events: WideEvent[], config: TConfig) => Promise<void>
}

export function defineDrain<TConfig>(options: DrainOptions<TConfig>): (ctx: DrainContext | DrainContext[]) => Promise<void> {
  return async (ctx: DrainContext | DrainContext[]) => {
    const contexts = Array.isArray(ctx) ? ctx : [ctx]
    if (contexts.length === 0) return

    const config = options.resolve()
    if (!config) return

    try {
      await options.send(contexts.map(c => c.event), config)
    } catch (error) {
      console.error(`[evlog/${options.name}] Failed to send events:`, error)
    }
  }
}
