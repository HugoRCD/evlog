import { connect } from '@vercel/connect/eve'
import { defineMcpClientConnection } from 'eve/connections'
import type { SessionContext } from 'eve/context'
import { canAccessAdminTools } from '../lib/trust'

const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID
const VERCEL_CONNECTOR_UID = process.env.VERCEL_CONNECTOR_UID

const ALLOWED_TOOLS: string[] = [
  'search_vercel_documentation',
  'list_deployments',
  'get_deployment',
  'get_deployment_build_logs',
  'get_runtime_logs',
  'get_runtime_errors',
  'get_project',
  'list_agent_run_projects',
  'list_agent_runs',
]

/**
 * Read-only Vercel platform access, gated to maintainer and app-principal
 * sessions. A blocked caller gets a terminal error instead of a silent
 * authorization challenge, matching the notes in docs/notes.md on app-scoped
 * Connect auth.
 */
function adminOnlyVercelAuth(connectorUid: string | undefined) {
  return (ctx: SessionContext) => {
    if (!canAccessAdminTools(ctx.session.auth.current)) {
      return {
        principalType: 'app' as const,
        async getToken(): Promise<never> {
          throw new Error('This tool is not available in the current session.')
        },
      }
    }
    if (!connectorUid) {
      return {
        principalType: 'app' as const,
        async getToken(): Promise<never> {
          throw new Error('VERCEL_CONNECTOR_UID is not configured.')
        },
      }
    }
    return connect({ connector: connectorUid, principalType: 'app', autoProvision: false })
  }
}

const VERCEL_MCP_INSTRUCTIONS = VERCEL_TEAM_ID && VERCEL_PROJECT_ID
  ? `**Vercel MCP connection (vercel__*, admin only) — read-only, use judiciously:**

- Discover exact schemas via \`connection_search\`, then call \`vercel__<tool>\`.
- Pass \`teamId=${VERCEL_TEAM_ID}\`, \`projectId=${VERCEL_PROJECT_ID}\` explicitly to \`list_deployments\`, \`get_deployment\`, \`get_deployment_build_logs\`, \`get_runtime_logs\`, \`get_runtime_errors\`, \`get_project\`.
- Evi's own Agent Runs (\`list_agent_runs\`) use the same \`teamId\` but a DIFFERENT \`projectId\` — the eve service's own project, not the app. Call \`list_agent_run_projects\` first to discover it. Still NOT tokens/cost — use \`ai_gateway__*\` for that. No per-run trace access — this connection only exposes run-level metadata, never raw conversation content.
- \`search_vercel_documentation\` needs no ids — general Vercel platform docs search.`
  : ''

export default defineMcpClientConnection({
  url: 'https://mcp.vercel.com',
  description: VERCEL_MCP_INSTRUCTIONS,
  tools: { allow: ALLOWED_TOOLS },
  auth: adminOnlyVercelAuth(VERCEL_CONNECTOR_UID),
})
