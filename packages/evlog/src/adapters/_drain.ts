import type { DrainContext, WideEvent } from '../types'

export interface DrainOptions<C> {
  name: string
  resolve: () => C | null
  send: (events: WideEvent[], config: C) => Promise<void>
}

export function defineDrain<C>(options: DrainOptions<C>): (ctx: DrainContext | DrainContext[]) => Promise<void> {
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
