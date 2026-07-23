import { z } from 'zod'

/**
 * Mirrors `GET /api/telemetry/stats` — see `getStatsForFilter()` in
 * `server/utils/telemetry-queries.ts`.
 */
export default defineMcpTool({
  description: 'Get aggregate evlog CLI telemetry stats for a time range: totals (runs, success/error counts, unique machines, avg duration), a breakdown by environment and by tool, the top commands, and daily success/error activity. Serves generated sample data when the dashboard has no real events yet.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: {
    range: z.enum(['24h', '7d', '30d']).default('7d').describe('Time window to aggregate over.'),
    tool: z.string().optional().describe('Restrict the aggregation to runs from this tool name (e.g. "evlog-cli"). Omit for all tools.'),
    environment: z.string().optional().describe('Restrict the aggregation to runs from this environment (e.g. "production"). Omit for all environments.'),
  },
  inputExamples: [
    { range: '7d' },
    { range: '30d', tool: 'evlog-cli', environment: 'production' },
  ],
  handler: ({ range, tool, environment }) => {
    return getStatsForFilter({ range, tool, environment })
  },
})
