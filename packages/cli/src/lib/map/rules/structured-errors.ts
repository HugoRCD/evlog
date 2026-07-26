import { HANDLER_KINDS } from './types'
import type { MapRule } from './types'

/** The message depends on which half of `{ why, fix }` is missing. */
function createErrorMessage(props: ReadonlySet<string>): string | null {
  const hasWhy = props.has('why')
  const hasFix = props.has('fix')
  if (hasWhy && hasFix) return null
  if (hasWhy) return 'createError() has why but missing fix'
  if (hasFix) return 'createError() has fix but missing why'
  return 'createError() missing why and fix'
}

/**
 * Are thrown errors explainable?
 *
 * `throw new Error('failed')` reaches the client as a string with no cause and
 * no remedy. `createError({ why, fix })` is what makes an error actionable for
 * whoever reads it at 3am.
 *
 * A handler that raises nothing is reported as not-applicable rather than
 * passing: there is no error to give a shape to, and a free pass made the report
 * claim "errors carry why and fix" about a file with no errors in it.
 */
export const structuredErrorsRule = {
  id: 'structured-errors',
  category: 'requirement',
  title: 'errors',
  expects: 'createError({ why, fix })',
  question: 'Do thrown errors carry why and fix?',
  weight: 20,
  docs: '/learn/structured-errors',
  appliesTo: {
    kinds: HANDLER_KINDS,
    when: ({ facts }) => facts.throws.length > 0 || facts.callsTo('createError').length > 0,
  },

  fixSlot: 'exit',
  suggest() {
    return [
      'throw createError({',
      '  status: 400,',
      '  message: \'what the caller sees\',',
      '  why: \'what actually went wrong\',',
      '  fix: \'what to do about it\',',
      '})',
    ]
  },

  create(context) {
    return {
      onEnd() {
        for (const thrown of context.facts.throws) {
          if (thrown.kind === 'plain-error') {
            context.report({
              message: 'throw new Error() — use createError({ why, fix })',
              line: thrown.line,
              snippet: true,
            })
            return
          }
          if (thrown.kind === 'create-error') {
            const message = createErrorMessage(thrown.props)
            if (message) {
              context.report({ message, line: thrown.line, snippet: true })
              return
            }
          }
        }

        /* `createError()` returned rather than thrown still shapes the response. */
        for (const call of context.facts.callsTo('createError')) {
          const message = createErrorMessage(call.props)
          if (message) {
            context.report({ message, line: call.line, snippet: true })
            return
          }
        }
      },
    }
  },
} satisfies MapRule
