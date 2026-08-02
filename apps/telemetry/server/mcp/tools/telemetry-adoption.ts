import { z } from 'zod'

/**
 * Mirrors `GET /api/telemetry/adoption` — see `getAdoptionForFilter()` in
 * `server/utils/telemetry-queries.ts`.
 */
export default defineMcpTool({
  description: 'Get evlog telemetry adoption data for a time range: tool version rollout over time, active vs first-ever-seen machines per bucket, a weekday/hour activity punchcard (UTC), and the breakdown of flags and custom fields with how often each value accompanied a failed run. Serves generated sample data when the dashboard has no real events yet.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: {
    range: z.enum(['24h', '7d', '30d']).default('7d').describe('Time window to aggregate over.'),
    tool: z.string().optional().describe('Restrict the aggregation to runs from this tool name (e.g. "evlog-cli"). Omit for all tools.'),
    environment: z.string().optional().describe('Restrict the aggregation to runs from this environment (e.g. "production"). Omit for all environments.'),
    source: z.string().optional().describe('Restrict to one source: "ci:<provider>" (e.g. "ci:github_actions"), "agent:<name>" (e.g. "agent:claude-code"), "terminal" (an interactive local run), or "automation" (a non-interactive local run). Omit for all sources.'),
  },
  inputExamples: [
    { range: '30d' },
    { range: '7d', tool: 'evlog-cli' },
  ],
  handler: ({ range, tool, environment, source }) => {
    return getCachedAdoptionForFilter({ range, tool, environment, source: source ? parseSourceToken(source) : undefined })
  },
})
