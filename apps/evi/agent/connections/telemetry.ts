import { defineMcpClientConnection } from 'eve/connections'
import type { SessionContext } from 'eve/context'
import { canAccessAdminTools } from '../lib/trust'

/** Production evlog telemetry, mirrored from the dashboard's own MCP endpoint. */
const TELEMETRY_MCP_URL = 'https://telemetry.evlog.cloud/mcp'

/**
 * The telemetry app's `/mcp` endpoint mirrors the dashboard's soft auth: with
 * `ANALYTICS_PASSWORD` unset it is open, so a blank token (absent
 * `TELEMETRY_MCP_TOKEN`) still works against a local dashboard. Once
 * production sets a password, the evi app must carry the same value as
 * `TELEMETRY_MCP_TOKEN`; a missing token then 403s every call loudly instead
 * of failing silently.
 */
const TELEMETRY_MCP_TOKEN = process.env.TELEMETRY_MCP_TOKEN

const ALLOWED_TOOLS: string[] = [
  'telemetry-stats',
  'telemetry-adoption',
  'telemetry-runs',
  'telemetry-run',
]

/**
 * Read-only production telemetry, gated to maintainer and app-principal
 * sessions (the same set as the Vercel connection). A blocked caller gets a
 * terminal error instead of a silent authorization challenge.
 */
function telemetryAuth() {
  return (ctx: SessionContext) => {
    if (!canAccessAdminTools(ctx.session.auth.current)) {
      return {
        principalType: 'app' as const,
        async getToken(): Promise<never> {
          throw new Error('This tool is not available in the current session.')
        },
      }
    }
    return {
      getToken: async () => ({ token: TELEMETRY_MCP_TOKEN ?? '' }),
    }
  }
}

const TELEMETRY_INSTRUCTIONS = [
  '**Telemetry MCP connection (telemetry__*, admin only): read-only production evlog CLI telemetry, use judiciously.**',
  '',
  '- `telemetry-stats`: aggregate for a range (24h/7d/30d): totals, success/error counts, unique machines, avg duration, the same totals for the preceding equal window (period-over-period), breakdowns by environment, tool, source (`ci:<provider>`, `agent:<name>`, `terminal`, `automation`), Node major, tool version and OS, top commands, top error codes, duration percentiles (p50/p95) with a histogram, and an activity timeline.',
  '- `telemetry-adoption`: version rollout over time, new vs returning machines, the weekday/hour punchcard, and the flag/custom-field breakdown.',
  '- `telemetry-runs`: the raw event list, with the same filter/sort/pagination options as the dashboard\'s runs browser.',
  '- `telemetry-run`: full detail (flags, custom fields, environment info) for one run by id.',
  '- Data is real production usage; the dashboard serves generated sample data only when no real events exist yet. Prefer `range: \'7d\'` for stable signals; the stats tool compares against the preceding window itself.',
].join(String.fromCharCode(10))

export default defineMcpClientConnection({
  url: TELEMETRY_MCP_URL,
  description: TELEMETRY_INSTRUCTIONS,
  tools: { allow: ALLOWED_TOOLS },
  auth: telemetryAuth(),
})
