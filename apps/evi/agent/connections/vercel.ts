import { defineMcpClientConnection } from 'eve/connections'
import { adminOnlyAppConnection } from '../lib/connect'

const { VERCEL_TEAM_ID } = process.env

const ALLOWED_TOOLS: string[] = [
  'search_vercel_documentation',
  'list_deployments',
  'get_deployment',
  'get_deployment_build_logs',
  'get_runtime_logs',
  'get_runtime_errors',
  'get_project',
  'get_web_analytics',
  'list_agent_run_projects',
  'list_agent_runs',
  'list_projects',
]

// The description must stay non-empty at build time, when VERCEL_TEAM_ID is
// absent; it is only interpolated here, never gated on.
const TEAM_ID = VERCEL_TEAM_ID ? `teamId=${VERCEL_TEAM_ID}` : 'the teamId from VERCEL_TEAM_ID'

const VERCEL_MCP_INSTRUCTIONS = [
  '**Vercel MCP connection (vercel__*, admin only): read-only, use judiciously.**',
  '',
  '- Discover exact schemas via `connection_search`, then call `vercel__<tool>`.',
  `- The connection is scoped to the evlog team (${ TEAM_ID }) but NOT to a single project: evlog runs several Vercel projects, and Evi may need logs, deployments, or agent runs from any of them. Pass the team id to \`list_deployments\`, \`get_deployment\`, \`get_deployment_build_logs\`, \`get_runtime_logs\`, \`get_runtime_errors\`, \`get_project\`, \`get_web_analytics\`, and use \`list_projects\` to enumerate the team's projects when you need an id or slug.`,
  '- Evi\'s own Agent Runs (`list_agent_runs`) live in the eve service\'s own project, not the app project. Call `list_agent_run_projects` first to discover it. Still NOT tokens/cost. Use `ai_gateway__*` for that. No per-run trace access: this connection only exposes run-level metadata, never raw conversation content.',
  '- `get_web_analytics` (production only, requires Web Analytics enabled on the project): `mode: \'count\'` (default) returns one total, e.g. visitors this week; `mode: \'aggregate\'` groups by up to two `by` dimensions (hour/day/week/month/year, country, route, requestPath, referrerHostname, deviceType, browserName, eventName, ...) and requires `since`+`until`. `dataset: \'visits\'` (default) for pageviews, `\'events\'` for custom track() events. `filter` is OData, e.g. `requestPath eq \'/docs\'`.',
  '- `search_vercel_documentation` needs no ids: general Vercel platform docs search.',
].join(String.fromCharCode(10))

export default defineMcpClientConnection({
  url: 'https://mcp.vercel.com',
  description: VERCEL_MCP_INSTRUCTIONS,
  tools: { allow: ALLOWED_TOOLS },
  auth: adminOnlyAppConnection('vercel/mcp'),
})
