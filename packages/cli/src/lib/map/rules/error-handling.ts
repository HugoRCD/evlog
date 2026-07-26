import { HANDLER_KINDS } from './types'
import type { MapRule } from './types'

/**
 * Does every `catch` do something with the error?
 *
 * A swallowed error is worse than an unhandled one: the request looks
 * successful, the event says nothing, and the failure is invisible until a user
 * reports it.
 *
 * A handler with no `catch` at all is not a gap and is reported as
 * not-applicable: evlog's framework integrations hook the runtime's error
 * channel (`nitroApp.hooks.hook('error')` in Nitro, `withEvlog` in Next), so an
 * exception that escapes is still recorded on the event with its status. The
 * rule used to pass for free in that case, which made the report claim
 * "failures are caught and logged" about a handler that catches nothing.
 */
export const errorHandlingRule = {
  id: 'error-handling',
  category: 'requirement',
  title: 'catch',
  expects: 'log.error in catch',
  question: 'Is every caught error logged or rethrown?',
  weight: 15,
  docs: '/learn/structured-errors',
  appliesTo: {
    kinds: HANDLER_KINDS,
    when: ({ facts }) => facts.catches.length > 0,
  },

  /* Opens the catch and logs; the report closes it with however the handler
     leaves, which is the `exit` slot's business and not this rule's. */
  fixSlot: 'guard',
  suggest() {
    return ['catch (error) {', '  log.error(error)']
  },

  create(context) {
    return {
      onEnd() {
        for (const clause of context.facts.catches) {
          if (clause.isEmpty) {
            context.report({
              message: 'empty catch block swallows errors',
              line: clause.line,
              snippet: true,
            })
            return
          }
          if (!clause.handled) {
            context.report({
              message: 'catch block swallows error without logging or rethrow',
              line: clause.line,
              snippet: true,
            })
            return
          }
        }
      },
    }
  },
} satisfies MapRule
