import { z } from 'zod'
import {
  estimateLogCost,
  EVLOG_EVENT_BYTES,
  LOG_COST_PROVIDERS,
  PINO_LINE_BYTES,
  PRICES_READ_ON,
} from '../../../app/utils/log-cost'

const PROVIDER_IDS = LOG_COST_PROVIDERS.map(p => p.id) as [string, ...string[]]

export default defineMcpTool({
  description: `Estimates what a month of logs costs today against what the same traffic costs with evlog, which emits one wide event per request instead of one line per step.

WHEN TO USE: someone asks whether evlog would lower their log bill, how much they would save at their traffic, or how consolidation compares against their provider's pricing.

HOW IT WORKS: the byte counts are measured, not assumed. Serializing the same checkout request gives ${PINO_LINE_BYTES} B per pino line against ${EVLOG_EVENT_BYTES} B for one evlog event, so consolidation removes duplicated envelope (level, timestamp, host, request bindings) rather than payload. Which figure moves a bill depends on the provider: most meter gigabytes, so the byte saving applies; a provider that also bills per million events indexed rewards the event count instead.

Pass a provider id to start from its published list rate, or pass perGb and perMillionIndexed directly. Rates were read on ${PRICES_READ_ON} and vendors change pricing without notice, so an explicit rate always beats the stored one. Sampling is applied to both shapes through keepPercent, because any logger can drop events: it lowers each bill without changing the ratio between them.`,
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: {
    requestsPerMonth: z.number().positive().describe('Requests the application serves per month, e.g. 10000000'),
    linesPerRequest: z.number().min(1).default(4).describe('Log lines the current logger writes per request, before evlog'),
    provider: z.enum(PROVIDER_IDS).optional().describe(`Provider whose list rates to start from: ${PROVIDER_IDS.join(', ')}`),
    perGb: z.number().min(0).optional().describe('USD per gigabyte ingested. Overrides the provider rate'),
    perMillionIndexed: z.number().min(0).optional().describe('USD per million events indexed. Overrides the provider rate. Zero for providers that do not meter events'),
    keepPercent: z.number().min(1).max(100).default(100).describe('Percentage of traffic kept after sampling. Applied to both shapes, since any logger can drop events'),
  },
  inputExamples: [
    { requestsPerMonth: 10_000_000, linesPerRequest: 4, provider: 'datadog' },
    { requestsPerMonth: 300_000_000, linesPerRequest: 7, perGb: 0.5, perMillionIndexed: 0 },
  ],
  outputSchema: {
    currency: z.string(),
    before: z.object({ events: z.number(), gb: z.number(), cost: z.number() }),
    after: z.object({ events: z.number(), gb: z.number(), cost: z.number() }),
    saved: z.number(),
    savedPercent: z.number(),
    basis: z.object({
      pinoLineBytes: z.number(),
      evlogEventBytes: z.number(),
      ratesFrom: z.string(),
      ratesReadOn: z.string(),
      perGb: z.number(),
      perMillionIndexed: z.number(),
      keepPercent: z.number(),
    }),
  },
  handler: async ({ requestsPerMonth, linesPerRequest, provider, perGb, perMillionIndexed, keepPercent }) => {
    const preset = LOG_COST_PROVIDERS.find(p => p.id === provider)
    if (provider && !preset) {
      throw createError({ statusCode: 400, message: `Unknown provider "${provider}". Known: ${PROVIDER_IDS.join(', ')}.` })
    }
    const gbRate = perGb ?? preset?.perGb
    const indexedRate = perMillionIndexed ?? preset?.perMillionIndexed
    if (gbRate === undefined || indexedRate === undefined) {
      throw createError({ statusCode: 400, message: 'Pass a provider, or both perGb and perMillionIndexed.' })
    }

    const estimate = estimateLogCost({
      requestsPerMonth,
      linesPerRequest,
      perGb: gbRate,
      perMillionIndexed: indexedRate,
      keepRatio: keepPercent / 100,
    })

    await captureServerEvent('mcp_tool_called', {
      tool: 'estimate-log-cost',
      provider: provider ?? null,
      requests_per_month: requestsPerMonth,
      lines_per_request: linesPerRequest,
      keep_percent: keepPercent,
      saved_percent: Math.round(estimate.savedRatio * 100),
    })

    return {
      structuredContent: {
        currency: 'USD',
        before: estimate.before,
        after: estimate.after,
        saved: estimate.saved,
        savedPercent: Math.round(estimate.savedRatio * 100),
        basis: {
          pinoLineBytes: PINO_LINE_BYTES,
          evlogEventBytes: EVLOG_EVENT_BYTES,
          ratesFrom: preset ? `${preset.name} list rate (${preset.note})` : 'caller-supplied rates',
          ratesReadOn: PRICES_READ_ON,
          perGb: gbRate,
          perMillionIndexed: indexedRate,
          keepPercent,
        },
      },
    }
  },
})
