import type { MapRule } from './types'

/**
 * When a page fetches data server-side, can it survive that fetch failing?
 *
 * Applies only to pages that actually fetch — a purely presentational page has
 * nothing to fail, so the rule reports itself as not-applicable.
 *
 * The error affordance is read from the AST and tied to the request it covers:
 * a `try` the call sits inside, a `.catch()` chained onto it, or an `error`
 * binding destructured from it. Checking the file for any of those instead let
 * an unrelated `try` elsewhere on the page vouch for a fetch nobody guarded.
 */
export const pageErrorHandlingRule = {
  id: 'page-error-handling',
  category: 'requirement',
  title: 'fetch',
  expects: 'fetch error handling',
  question: 'Does this page handle its data fetch failing?',
  weight: 20,
  docs: '/learn/lifecycle',
  appliesTo: {
    kinds: ['page'],
    when: ({ facts }) => facts.network.length > 0,
  },

  suggest({ framework }) {
    if (framework === 'nuxt') {
      return [
        'const { data, error } = await useFetch(\'/api/orders\')',
        'if (error.value) log.error(error.value)',
      ]
    }
    return [
      'try {',
      '  const orders = await getOrders()',
      '} catch (error) {',
      '  log.error(error)',
      '}',
    ]
  },

  create(context) {
    const { facts } = context
    return {
      onEnd() {
        const [unguarded] = facts.unguardedNetwork
        if (!unguarded) return
        context.report({
          message: `${unguarded.name}() without error handling — the page breaks when it fails`,
          line: unguarded.line,
        })
      },
    }
  },
} satisfies MapRule
