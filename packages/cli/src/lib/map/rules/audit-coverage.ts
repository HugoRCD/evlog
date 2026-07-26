import { HANDLER_KINDS } from './types'
import type { MapRule } from './types'

/** Calls that change state, and are therefore worth an audit record. */
const WRITE_CALLS = ['create', 'update', 'insert', 'upsert', 'delete', 'destroy']

/**
 * The project records audit events — is this write covered?
 *
 * Complements the `audit` requirement, which only fires on entry points the
 * sensitivity classifier flagged as money or auth. This one is softer and wider:
 * once a team has an audit trail, every state change is a candidate, and they
 * are the ones who know which ones matter.
 */
export const auditCoverageRule = {
  id: 'audit-coverage',
  category: 'opportunity',
  title: 'audit+',
  expects: 'log.audit',
  question: 'Should this state change be on the audit trail too?',
  docs: '/use-cases/audit/recording',
  appliesTo: {
    kinds: HANDLER_KINDS,
    when: ({ project, target, facts }) => {
      /* High sensitivity is already the `audit` requirement's job — no double
         reporting for the same gap. */
      if (target.sensitivity.level === 'high') return false
      if (!project.features.has('audit')) return false
      return facts.loggerCalls('audit').length === 0 && hasWrite(facts)
    },
  },

  suggest() {
    return [
      'log.audit({',
      '  action: \'order.updated\',',
      '  actor: { type: \'user\', id: user.id },',
      '  resource: { type: \'order\', id: order.id },',
      '})',
    ]
  },

  create(context) {
    const { facts } = context
    return {
      onEnd() {
        const write = facts.calls.find(call => WRITE_CALLS.includes(call.member.toLowerCase()))
        context.report({
          message: 'changes state with no audit record — the project records audit events elsewhere',
          line: write?.line,
        })
      },
    }
  },
} satisfies MapRule

function hasWrite(facts: { calls: readonly { member: string }[] }): boolean {
  return facts.calls.some(call => WRITE_CALLS.includes(call.member.toLowerCase()))
}
