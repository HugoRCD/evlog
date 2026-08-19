import { useLogger } from 'evlog/eve'
import { defineDynamic, defineTool } from 'eve/tools'
import { z } from 'zod'
import { defaultReportTag, reportQuery, scopedReport } from '../lib/gateway'
import { canAccessAdminTools } from '../lib/trust'

const BASE_URL = 'https://ai-gateway.vercel.sh/v1'
const FETCH_TIMEOUT_MS = 10_000

function apiKey(): string {
  const key = process.env.AI_GATEWAY_API_KEY?.trim()
  if (!key) throw new Error('AI_GATEWAY_API_KEY is not configured')
  return key
}

async function gatewayFetch(path: string, params: Record<string, string | undefined> = {}): Promise<unknown> {
  const url = new URL(`${BASE_URL}${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value)
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey()}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`AI Gateway API error (${response.status}): ${await response.text()}`)
  }
  return await response.json()
}

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

// Admin-only spend observability. Keep executes inline in the resolver
// (docs/notes.md); keys carry the ai_gateway__ namespace themselves.
export default defineDynamic({
  events: {
    'turn.started': (_event, ctx) => {
      if (!canAccessAdminTools(ctx.session.auth.current)) return null
      return {
        ai_gateway__credits: defineTool({
          description: 'Admin: AI Gateway credit balance and lifetime spend for the entire team account (not Evi-scoped). Prefer ai_gateway__report for Evi digests.',
          inputSchema: z.object({}),
          async execute(_input, toolCtx) {
            if (!canAccessAdminTools(toolCtx.session.auth.current)) {
              return { success: false as const, error: 'AI Gateway reporting is not available in this session.' }
            }
            return await gatewayFetch('/credits')
          },
        }),
        ai_gateway__report: defineTool({
          description: `Admin: Evi-scoped AI Gateway spend/tokens over a date range. Scopes via AI_GATEWAY_REPORT_API_KEY_NAME (preferred for historical) and/or tags (default ${defaultReportTag()}). Never returns unscoped account totals.`,
          inputSchema: z.object({
            startDate: dateSchema.describe('Start date (UTC, inclusive), YYYY-MM-DD'),
            endDate: dateSchema.describe('End date (UTC, inclusive), YYYY-MM-DD'),
            groupBy: z.enum(['day', 'user', 'model', 'tag', 'provider', 'credential_type', 'zero_data_retention', 'api_key_name']).optional().describe('Defaults to "api_key_name" when AI_GATEWAY_REPORT_API_KEY_NAME is configured, otherwise "model". Requesting one explicitly forces tag scoping, since key-name scoping needs the grouping for itself.'),
            datePart: z.enum(['day', 'hour']).optional().describe('Time granularity, only applies when groupBy is "day"'),
            userId: z.string().optional(),
            model: z.string().optional().describe('creator/model-name, e.g. anthropic/claude-sonnet-4.6'),
            provider: z.string().optional(),
            credentialType: z.enum(['byok', 'system']).optional(),
            tags: z.array(z.string()).optional().describe('Override default report tags (env AI_GATEWAY_REPORT_TAGS / default evi:env:<environment>). Ignored while key-name scoping applies, i.e. AI_GATEWAY_REPORT_API_KEY_NAME is set and no groupBy was requested.'),
            tagsMatch: z.enum(['any', 'all']).optional(),
          }).refine(({ startDate, endDate }) => startDate <= endDate, {
            message: 'startDate must not be later than endDate',
            path: ['startDate'],
          }),
          async execute(input, toolCtx) {
            if (!canAccessAdminTools(toolCtx.session.auth.current)) {
              return { success: false as const, error: 'AI Gateway reporting is not available in this session.' }
            }
            const query = reportQuery(input)
            const payload = await gatewayFetch('/report', {
              start_date: input.startDate,
              end_date: input.endDate,
              group_by: query.groupBy,
              date_part: input.datePart,
              user_id: input.userId,
              model: input.model,
              provider: input.provider,
              credential_type: input.credentialType,
              tags: query.tags?.join(','),
              tags_match: query.tagsMatch,
            })
            const report = scopedReport(payload, query)
            useLogger(toolCtx).set({
              gateway: {
                report: {
                  mode: report.scope.mode,
                  groupBy: query.groupBy,
                  matchedRows: report.scope.matchedRows,
                },
              },
            })
            return report
          },
        }),
        ai_gateway__generation: defineTool({
          description: 'Admin: cost, latency, and token usage for a single AI Gateway generation id.',
          inputSchema: z.object({
            id: z.string().min(1).describe('Generation id, e.g. gen_01ARZ3NDEKTSV4RRFFQ69G5FAV'),
          }),
          async execute(input, toolCtx) {
            if (!canAccessAdminTools(toolCtx.session.auth.current)) {
              return { success: false as const, error: 'AI Gateway reporting is not available in this session.' }
            }
            return await gatewayFetch('/generation', { id: input.id })
          },
        }),
      }
    },
  },
})
