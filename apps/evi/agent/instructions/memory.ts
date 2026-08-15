import { defineDynamic, defineInstructions } from 'eve/instructions'
import { memoryAvailable } from '../lib/memory/config'
import { buildCoreBlock, openMemorySession } from '../lib/memory/session'

/**
 * Session-scoped on purpose: the block sits in the cached prompt prefix, and
 * resolving it per turn would invalidate everything behind it.
 */
export default defineDynamic({
  events: {
    'session.started': async (_event, ctx) => {
      if (!memoryAvailable()) return null
      try {
        const session = await openMemorySession(ctx.session.auth.current)
        if (session === null) return null
        const markdown = await buildCoreBlock(session)
        return markdown === null ? null : defineInstructions({ markdown })
      } catch (error) {
        // Memory is additive, and a resolver that throws fails the whole turn.
        console.error('[evi:memory] core block failed', error)
        return null
      }
    },
  },
})
