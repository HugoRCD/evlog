import { connect } from '@vercel/connect/eve'
import type { SessionContext } from 'eve/context'
import { canAccessAdminTools } from './trust'

/**
 * Admin gate for a connection's auth: maintainer and schedule sessions get
 * the granted credential; anyone else gets a terminal error instead of a
 * silent authorization challenge.
 */
export function adminGatedAuth<T>(grant: (ctx: SessionContext) => T) {
  return (ctx: SessionContext) => {
    if (!canAccessAdminTools(ctx.session.auth.current)) {
      return {
        principalType: 'app' as const,
        getToken(): Promise<never> {
          return Promise.reject(new Error('This tool is not available in the current session.'))
        },
      }
    }
    return grant(ctx)
  }
}

/** App-scoped Connect auth for admin-gated MCP connections. */
export function adminOnlyAppConnection(connector: string) {
  return adminGatedAuth(() => connect({ connector, principalType: 'app', autoProvision: false }))
}
