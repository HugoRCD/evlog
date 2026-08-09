import { defineMcpClientConnection } from 'eve/connections'
import { adminOnlyAppConnection } from '../lib/connect'

/**
 * Linear's hosted MCP, on its read-only endpoint: writes are impossible
 * server-side, so no client allowlist is needed. The bearer token comes from
 * a dedicated Connect connector; Linear accepts it directly in the
 * Authorization header, no interactive OAuth hop.
 */
export default defineMcpClientConnection({
  url: 'https://mcp.linear.app/mcp/readonly',
  description: "Hugo's Linear workspace, read-only (admin only): issues, projects, initiatives, milestones, cycles, documents, status updates. The authority on what is planned, in progress, or decided in Linear. Use it to answer questions about planning state or to ground a digest; interacting with Linear (creating or updating issues) happens on the Linear channel, not here.",
  auth: adminOnlyAppConnection('scl_D48zMshnOiQncJ3eFn2mRA'),
})
