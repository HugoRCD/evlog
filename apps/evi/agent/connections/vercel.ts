import { connect } from '@vercel/connect/eve'
import { defineMcpClientConnection } from 'eve/connections'
import type { SessionContext } from 'eve/context'
import { canAccessAdminTools } from '../lib/trust'

const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID

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
function adminOnlyVercelAuth() {
  return (ctx: SessionContext) => {
    if (!canAccessAdminTools(ctx.session.auth.current)) {
      return {
        principalType: 'app' as const,
        async getToken(): Promise<never> {
          throw new Error('This tool is not available in the current session.')
        },
      }
    }
    return connect({ connector: 'vercel/mcp', principalType: 'app', autoProvision: false })
  }
}

// The description must stay non-empty at build time, when VERCEL_TEAM_ID is
// absent; it is only interpolated here, never gated on.
const TEAM_ID = VERCEL_TEAM_ID ? `teamId=${VERCEL_TEAM_ID}` : 'the teamId from VERCEL_TEAM_ID'

const VERCEL_MCP_INSTRUCTIONS = `**Vercel MCP connection (vercel__*, admin only): read-only, use judiciously.**

- Discover exact schemas via \`connection_search\`, then call \`vercel__<tool>\`.
- The connection is scoped to the evlog team (${TEAM_ID}) but NOT to a single project: evlog runs several Vercel projects, and Evi may need logs, deployments, or agent runs from any of them. Pass the team id to \`list_deployments\`, \`get_deployment\`, \`get_deployment_build_logs\`, \`get_runtime_logs\`, \`get_runtime_errors\`, \`get_project\`, and use \`list_agent_run_projects\` to find the project hosting Evi's Agent Runs.
- Evi's own Agent Runs (\`list_agent_runs\`) live in the eve service's own project, not the app project. Call \`list_agent_run_projects\` first to discover it. Still NOT tokens/cost. Use \`ai_gateway__*\` for that. No per-run trace access: this connection only exposes run-level metadata, never raw conversation content.
- \`search_vercel_documentation\` needs no ids: general Vercel platform docs search.`

export default defineMcpClientConnection({
  url: 'https://mcp.vercel.com',
  description: VERCEL_MCP_INSTRUCTIONS,
  tools: { allow: ALLOWED_TOOLS },
  auth: adminOnlyVercelAuth(),
})