import { z } from 'zod'

const SORT_KEYS = ['timestamp', 'tool', 'command', 'environment', 'outcome', 'durationMs', 'machineId'] as const

/**
 * Mirrors `GET /api/telemetry/runs` — see `getRunsPageForFilter()` in
 * `server/utils/telemetry-queries.ts`.
 */
export default defineMcpTool({
  description: 'List/query evlog telemetry runs (the dashboard\'s raw events browser) with filtering by time range, tool, environment, and source (CI provider, AI agent, terminal, or automation), plus sorting and pagination. Serves generated sample data when the dashboard has no real events yet.',
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: {
    range: z.enum(['24h', '7d', '30d']).default('7d').describe('Time window to filter runs by.'),
    tool: z.string().optional().describe('Restrict to runs from this tool name (e.g. "evlog-cli"). Omit for all tools.'),
    environment: z.string().optional().describe('Restrict to runs from this environment (e.g. "production"). Omit for all environments.'),
    source: z.string().optional().describe('Restrict to one source: "ci:<provider>" (e.g. "ci:github_actions"), "agent:<name>" (e.g. "agent:claude-code"), "terminal" (an interactive local run), or "automation" (a non-interactive local run). Omit for all sources.'),
    sort: z.enum(SORT_KEYS).default('timestamp').describe('Column to sort by.'),
    order: z.enum(['asc', 'desc']).default('desc').describe('Sort direction.'),
    page: z.number().int().min(1).default(1).describe('1-based page number.'),
    pageSize: z.number().int().min(1).max(100).default(25).describe('Rows per page, capped at 100.'),
  },
  inputExamples: [
    { range: '7d' },
    { range: '24h', environment: 'production', sort: 'durationMs', order: 'desc', pageSize: 10 },
  ],
  handler: ({ range, tool, environment, source, sort, order, page, pageSize }) => {
    return getRunsPageForFilter(
      { range, tool, environment, source: source ? parseSourceToken(source) : undefined },
      { sort, order, page, pageSize },
    )
  },
})
