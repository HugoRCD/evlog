import { getVercelOidcToken } from '@vercel/oidc'
import { defineMcpClientConnection } from 'eve/connections'
import { adminGatedAuth } from '../lib/connect'

/** Production evlog telemetry, mirrored from the dashboard's own MCP endpoint. */
const TELEMETRY_MCP_URL = 'https://telemetry.evlog.cloud/mcp'

const ALLOWED_TOOLS: string[] = [
  'telemetry-stats',
  'telemetry-adoption',
  'telemetry-runs',
  'telemetry-run',
]

const TELEMETRY_INSTRUCTIONS = [
  '**Telemetry MCP connection (telemetry__*, admin only): read-only production evlog CLI telemetry, use judiciously.**',
  '',
  '- `telemetry-stats`: aggregate for a range (24h/7d/30d): totals, success/error counts, unique machines, avg duration, the same totals for the preceding equal window (period-over-period), breakdowns by environment, tool, source (`ci:<provider>`, `agent:<name>`, `terminal`, `automation`), Node major, tool version and OS, top commands, top error codes, duration percentiles (p50/p95) with a histogram, and an activity timeline.',
  '- `telemetry-adoption`: version rollout over time, new vs returning machines, the weekday/hour punchcard, and the flag/custom-field breakdown.',
  '- `telemetry-runs`: the raw event list, with the same filter/sort/pagination options as the dashboard\'s runs browser.',
  '- `telemetry-run`: full detail (flags, custom fields, environment info) for one run by id.',
  '- Data is real production usage; the dashboard serves generated sample data only when no real events exist yet. Prefer `range: \'7d\'` for stable signals; the stats tool compares against the preceding window itself.',
].join(String.fromCharCode(10))

/**
 * The bearer is the deployment's own Vercel OIDC token, verified by the
 * telemetry app against Vercel's JWKS (docs/notes.md). Fetched per call: the
 * env token is minted at boot and expires within the hour on a warm instance.
 */
export default defineMcpClientConnection({
  url: TELEMETRY_MCP_URL,
  description: TELEMETRY_INSTRUCTIONS,
  tools: { allow: ALLOWED_TOOLS },
  auth: adminGatedAuth(() => ({
    getToken: async () => ({ token: await getVercelOidcToken() }),
  })),
})
