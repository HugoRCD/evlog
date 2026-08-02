import { z } from 'zod'

/**
 * Mirrors `GET /api/telemetry/stats` — see `getStatsForFilter()` in
 * `server/utils/telemetry-queries.ts`.
 */
export default defineMcpTool({
  description: 'Get aggregate evlog telemetry stats for a time range: totals (runs, success/error counts, unique machines, avg duration) plus the same totals for the preceding window of equal length for period-over-period comparison, breakdowns by environment, tool, source (CI provider, AI agent, terminal, or automation), Node major, tool version and OS, top commands, top error codes, duration percentiles (p50/p95) with a histogram, and an activity timeline bucketed hourly (24h range) or daily, carrying per-bucket success/error counts, distinct machines, and average/p95 duration. Serves generated sample data when the dashboard has no real events yet.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: {
    range: z.enum(['24h', '7d', '30d']).default('7d').describe('Time window to aggregate over.'),
    tool: z.string().optional().describe('Restrict the aggregation to runs from this tool name (e.g. "evlog-cli"). Omit for all tools.'),
    environment: z.string().optional().describe('Restrict the aggregation to runs from this environment (e.g. "production"). Omit for all environments.'),
    source: z.string().optional().describe('Restrict to one source: "ci:<provider>" (e.g. "ci:github_actions"), "agent:<name>" (e.g. "agent:claude-code"), "terminal" (an interactive local run), or "automation" (a non-interactive local run). Omit for all sources.'),
  },
  inputExamples: [
    { range: '7d' },
    { range: '30d', tool: 'evlog-cli', environment: 'production' },
  ],
  handler: ({ range, tool, environment, source }) => {
    // Same cursor-invalidated cache the dashboard uses — an agent sweeping
    // several ranges in a row (or several agents at once) then costs one
    // aggregation per filter instead of one per call.
    return getCachedStatsForFilter({ range, tool, environment, source: source ? parseSourceToken(source) : undefined })
  },
})
