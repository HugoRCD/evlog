import { defineDynamic, defineInstructions } from 'eve/instructions'
import { memoryAvailable } from '../lib/memory/config'
import { buildCoreBlock, openMemorySession } from '../lib/memory/session'

/**
 * Resolved once per session, not per turn.
 *
 * eve lowers each fragment to a system message and keeps session-scoped ones
 * ahead of turn-scoped ones, so a block resolved here sits in the stable half
 * of the prompt prefix and stays cached for every turn of the session. Evi's
 * prompt cache hit rate is the thing memory is most able to damage; a block
 * that changed per turn would invalidate everything behind it.
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
      }
      catch (error) {
        // Memory is additive, and a resolver that throws fails the whole turn.
        console.error('[evi:memory] core block failed', error)
        return null
      }
    },
  },
})
