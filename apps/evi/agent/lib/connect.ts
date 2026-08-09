import { connect } from '@vercel/connect/eve'
import type { SessionContext } from 'eve/context'
import { canAccessAdminTools } from './trust'

/**
 * App-scoped Connect auth for admin-gated MCP connections: maintainer and
 * schedule sessions get the connector's token; anyone else gets a terminal
 * error instead of a silent authorization challenge.
 */
export function adminOnlyAppConnection(connector: string) {
  return (ctx: SessionContext) => {
    if (!canAccessAdminTools(ctx.session.auth.current)) {
      return {
        principalType: 'app' as const,
        async getToken(): Promise<never> {
          throw new Error('This tool is not available in the current session.')
        },
      }
    }
    return connect({ connector, principalType: 'app', autoProvision: false })
  }
}
