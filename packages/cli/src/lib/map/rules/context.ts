import { HANDLER_KINDS } from './types'
import type { MapRule } from './types'

/**
 * Does the handler attach anything to its event?
 *
 * A logger with no `log.set()` produces a technically-valid event that says
 * nothing about the request it describes, which is the most common way a wide
 * event ends up useless in production.
 *
 * Only `set()` calls on a resolved evlog logger count. The previous
 * implementation matched any `.set()` in the file, so a `Map.set()` was enough
 * to pass this rule.
 */
export const contextRule = {
  id: 'context',
  category: 'requirement',
  title: 'context',
  expects: 'log.set',
  question: 'Is request context attached to the event?',
  weight: 15,
  docs: '/learn/wide-events',
  appliesTo: { kinds: HANDLER_KINDS },

  fixSlot: 'setup',
  suggest() {
    return ['log.set({ user: { id }, order: { id, total } })']
  },

  create(context) {
    return {
      onEnd() {
        if (context.facts.loggerCalls('set').length > 0) return
        context.report({
          message: context.hasEvlog
            ? 'no log.set() context accumulation'
            : 'no log.set() — adopt evlog for request context',
        })
      },
    }
  },
} satisfies MapRule
