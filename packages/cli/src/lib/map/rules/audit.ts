import { HANDLER_KINDS } from './types'
import type { MapRule, RuleTarget } from './types'

/** Route segments that name nothing: prefixes, indexes, and dynamic params. */
function isAnonymousSegment(segment: string): boolean {
  if (segment.length === 0) return true
  if (segment === 'api' || segment === 'index') return true
  return segment.startsWith('[') || segment.startsWith(':') || segment.startsWith('*')
}

/** Verb implied by the HTTP method, used only when the path is a single word. */
const METHOD_VERBS: Record<string, string> = {
  POST: 'created',
  PUT: 'updated',
  PATCH: 'updated',
  DELETE: 'deleted',
  GET: 'read',
}

/**
 * A plausible audit action for an entry point, read off its route path.
 *
 * The suggested action used to be the literal `payment.captured` everywhere,
 * which read as nonsense on `/api/auth/login` and made the whole snippet look
 * like filler. `/api/auth/login` now suggests `auth.login`.
 */
export function auditAction(target: Pick<RuleTarget, 'path' | 'method'>): string {
  const named = target.path.split('/').filter(segment => !isAnonymousSegment(segment))
  if (named.length === 0) return 'resource.action'
  if (named.length === 1) {
    const verb = METHOD_VERBS[target.method?.toUpperCase() ?? ''] ?? 'action'
    return `${named[0]}.${verb}`
  }
  return named.join('.')
}


/**
 * Does a sensitive entry point leave an audit trail?
 *
 * Only runs where the sensitivity classifier found money or auth — everywhere
 * else an audit record would be noise, so the rule reports itself as
 * not-applicable rather than passing for free.
 */
export const auditRule = {
  id: 'audit',
  category: 'requirement',
  title: 'audit',
  expects: 'log.audit',
  question: 'Does this sensitive entry point leave an audit trail?',
  weight: 25,
  docs: '/use-cases/audit/overview',
  appliesTo: {
    kinds: HANDLER_KINDS,
    when: ({ target }) => target.sensitivity.level === 'high',
  },

  suggest({ target }) {
    return [
      'log.audit({',
      `  action: '${auditAction(target)}',`,
      '  actor: { type: \'user\', id: user.id },',
      '})',
    ]
  },

  create(context) {
    return {
      onEnd() {
        if (context.facts.loggerCalls('audit').length > 0) return
        context.report({
          message: context.hasEvlog
            ? 'has logger + context but no log.audit() — sensitive route needs audit trail'
            : 'sensitive route without log.audit()',
        })
      },
    }
  },
} satisfies MapRule
