import type { MapRule } from './types'

/**
 * When a page fetches data server-side, can it survive that fetch failing?
 *
 * Applies only to pages that actually fetch — a purely presentational page has
 * nothing to fail, so the rule reports itself as not-applicable.
 *
 * The error affordance is read from the AST: a `catch`, a `.catch()`, an
 * `onError` handler, or an `error` binding destructured from the fetch. The
 * previous implementation matched `/error\s*[:=]/` against the whole source,
 * which any variable named `errorMessage` was enough to satisfy.
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
        const handled = facts.catches.length > 0
          || facts.callsTo('catch').length > 0
          || facts.callsTo('onError').length > 0
          || facts.callsTo('catchError').length > 0
          || facts.destructuresNetworkError
        if (handled) return
        context.report({ message: 'page data fetch without error handling', line: 1 })
      },
    }
  },
} satisfies MapRule
