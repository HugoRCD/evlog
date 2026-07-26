import { HANDLER_KINDS } from './types'
import type { MapRule } from './types'

/**
 * This project uses Better Auth — do its events know who the user is?
 *
 * Gated on `better-auth` being a dependency. `evlog/better-auth` attaches the
 * user and session to every event, which is what turns "a request failed" into
 * "this user's request failed" when someone reports a problem.
 */
export const authIdentityRule = {
  id: 'auth-identity',
  category: 'opportunity',
  /* One Nitro plugin, installed once — not a per-handler edit. */
  scope: 'project',
  title: 'identity',
  expects: 'evlog/better-auth',
  question: 'Do events carry the authenticated user?',
  docs: '/use-cases/better-auth/overview',
  appliesTo: {
    kinds: HANDLER_KINDS,
    when: ({ project, facts, target }) => {
      if (!project.pairable.has('better-auth')) return false
      if (project.features.has('better-auth')) return false
      /* Only where auth is actually in play: the auth routes themselves, or a
         handler that reads the session. */
      const touchesAuth = target.sensitivity.reasons.some(reason => reason.startsWith('auth:'))
      const readsSession = facts.callsTo('getSession').length > 0
        || facts.imports.has('auth')
        || facts.names.has('session')
      return touchesAuth || readsSession
    },
  },

  suggest() {
    return [
      'import { createAuthMiddleware } from \'evlog/better-auth\'',
      '',
      'export default defineNitroPlugin(createAuthMiddleware(auth))',
    ]
  },

  create(context) {
    return {
      onEnd() {
        context.report({
          message: 'Better Auth is installed but evlog/better-auth is not — events carry no user identity',
        })
      },
    }
  },
} satisfies MapRule
