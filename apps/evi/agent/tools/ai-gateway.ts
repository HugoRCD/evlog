import { defineDynamic, defineTool } from 'eve/tools'
import { z } from 'zod'
import { environment } from '../lib/environment'
import { canAccessAdminTools } from '../lib/trust'

const BASE_URL = 'https://ai-gateway.vercel.sh/v1'
const FETCH_TIMEOUT_MS = 10_000

function apiKey(): string {
  const key = process.env.AI_GATEWAY_API_KEY?.trim()
  if (!key) throw new Error('AI_GATEWAY_API_KEY is not configured')
  return key
}

function defaultReportTag(): string {
  return `evi:env:${environment()}`
}

/**
 * Comma-separated tags from env, or the Evi attribution tag for the
 * environment this agent runs in. Never empty: an empty `tags` param on the
 * Custom Reporting call is not "no match", it is "no filter" — the
 * account-wide, unscoped totals this tool exists to prevent. A misconfigured
 * env var (e.g. all commas/whitespace) falls back to the default tag instead
 * of silently widening the scope.
 */
function defaultReportTags(): string[] {
  const raw = process.env.AI_GATEWAY_REPORT_TAGS?.trim()
  const fallback = [defaultReportTag()]
  if (!raw) return fallback
  const tags = raw.split(',').map((tag) => tag.trim()).filter(Boolean)
  return tags.length ? tags : fallback
}

function reportApiKeyName(): string | undefined {
  return process.env.AI_GATEWAY_REPORT_API_KEY_NAME?.trim() || undefined
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

type ReportRow = Record<string, unknown> & { api_key_name?: string }

function filterReportByApiKeyName(payload: unknown, apiKeyName: string): {
  results: ReportRow[]
  matchedRows: number
  note: string
} {
  const results = payload && typeof payload === 'object' && Array.isArray((payload as { results?: unknown }).results)
    ? (payload as { results: ReportRow[] }).results
    : []
  const needle = apiKeyName.toLowerCase()
  const filtered = results.filter(
    (row) => typeof row.api_key_name === 'string' && row.api_key_name.toLowerCase() === needle,
  )
  return {
    results: filtered,
    matchedRows: filtered.length,
    note: filtered.length === 0
      ? `No rows matched AI_GATEWAY_REPORT_API_KEY_NAME="${apiKeyName}". Do not quote account-wide totals.`
      : `Filtered to API key "${apiKeyName}" only.`,
  }
}

/**
 * Admin-only spend observability. Resolved at turn.started with the tools
 * defined inline: eve's bundler registers each `execute` as a step function
 * only when it sits inline in the handler body, and a factory-built map
 * breaks tool execution on resumed sessions. Keys are bare tool names (no
 * file-slug prefix), so the namespace is spelled out to match every
 * ai_gateway__* reference.
 */
export default defineDynamic({
  events: {
    'turn.started': (_event, ctx) => {
      if (!canAccessAdminTools(ctx.session.auth.current)) return null
      return {
    ai_gateway__credits: defineTool({
      description: 'Admin: AI Gateway credit balance and lifetime spend for the entire team account (not Evi-scoped). Prefer ai_gateway__report for Evi digests.',
      inputSchema: z.object({}),
      async execute() {
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
      async execute(input) {
        const configuredKeyName = reportApiKeyName()
        // Key-name scope covers historical untagged traffic on a dedicated Evi
        // key, but it spends the single `group_by` slot on `api_key_name` to do
        // it. So it only applies while the caller leaves the grouping open — an
        // explicit `groupBy` has to win, otherwise a digest asking for `tag` to
        // break spend down per surface would quietly get key-name rows instead.
        const keyNameScope = input.groupBy ? undefined : configuredKeyName
        const groupBy = keyNameScope ? 'api_key_name' : (input.groupBy ?? 'model')
        // Tags are how requests are attributed going forward (evi:env:*, evi:surface:*).
        const tags = keyNameScope
          ? undefined
          : (input.tags?.length ? input.tags : defaultReportTags())
        const tagsMatch = tags ? (input.tagsMatch ?? 'all') : undefined
        const payload = await gatewayFetch('/report', {
          start_date: input.startDate,
          end_date: input.endDate,
          group_by: groupBy,
          date_part: input.datePart,
          user_id: input.userId,
          model: input.model,
          provider: input.provider,
          credential_type: input.credentialType,
          tags: tags?.join(','),
          tags_match: tagsMatch,
        })
        if (keyNameScope) {
          const { results, matchedRows, note } = filterReportByApiKeyName(payload, keyNameScope)
          return {
            results,
            scope: {
              mode: 'api_key_name' as const,
              apiKeyName: configuredKeyName,
              matchedRows,
              groupBy,
              note: `${note} Custom Reporting is account-wide; empty results mean no attributable Evi spend, do not invent or fall back to team totals.`,
            },
          }
        }
        const results = payload && typeof payload === 'object' && Array.isArray((payload as { results?: unknown }).results)
          ? (payload as { results: unknown[] }).results
          : []
        return {
          results,
          scope: {
            mode: 'tags' as const,
            tags,
            tagsMatch,
            groupBy,
            matchedRows: results.length,
            note: configuredKeyName
              ? `Scoped by tags, not by API key "${configuredKeyName}", because groupBy="${groupBy}" was requested and key-name scoping needs the grouping for itself. Spend predating tagging is out of scope here; omit groupBy for the full historical figure. Do not fall back to account-wide totals.`
              : 'Scoped by tags only. Empty results usually mean traffic predates evi:env tagging (or set AI_GATEWAY_REPORT_API_KEY_NAME). Do not fall back to account-wide totals.',
          },
        }
      },
    }),
    ai_gateway__generation: defineTool({
      description: 'Admin: cost, latency, and token usage for a single AI Gateway generation id.',
      inputSchema: z.object({
        id: z.string().min(1).describe('Generation id, e.g. gen_01ARZ3NDEKTSV4RRFFQ69G5FAV'),
      }),
      async execute(input) {
        return await gatewayFetch('/generation', { id: input.id })
      },
    }),
      }
    },
  },
})
