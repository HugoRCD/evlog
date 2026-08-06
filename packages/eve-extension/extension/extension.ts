import { defineExtension } from 'eve/extension'
import { z } from 'zod'

/** Drain adapters the extension can resolve by name. */
export const ADAPTER_NAMES = [
  'axiom',
  'better-stack',
  'clickhouse',
  'datadog',
  'fs',
  'hyperdx',
  'loki',
  'memory',
  'otlp',
  'posthog',
  'sentry',
] as const

const adapter = z.union([
  z.enum(ADAPTER_NAMES),
  z.object({
    type: z.enum(ADAPTER_NAMES),
    /** Passed straight to the adapter factory, overriding its env defaults. */
    options: z.record(z.string(), z.unknown()).optional(),
  }),
])

/**
 * Consumer-facing settings. Everything is declarative: a Standard Schema is
 * validated synchronously at the mount site, so it cannot carry functions.
 * Agents needing a custom `drain`, `enrich` or `keep` use `defineEvlogHook`
 * from `evlog/eve` in `agent/hooks/` instead.
 */
export default defineExtension({
  config: z.object({
    /** Service name on every event. Defaults to the agent name. */
    service: z.string().optional(),
    /** Where events go. Several adapters fan out. */
    adapter: z.union([adapter, z.array(adapter)]).default('fs'),
    /** How much of the user message to record. */
    message: z.enum(['omit', 'preview', 'full']).default('omit'),
    /** Max characters kept in `preview` mode. */
    messagePreviewLength: z.number().int().positive().optional(),
    /** PII auto-redaction: `true` for the built-in patterns, or explicit paths. */
    redact: z
      .union([z.boolean(), z.object({ paths: z.array(z.string()) })])
      .default(true),
    /** Fraction of routine turns to keep, between 0 and 1. Unset keeps all. */
    sample: z.number().min(0).max(1).optional(),
    /** Always keep turns that failed, were rejected, or lost an authorization. */
    keepOnFailure: z.boolean().default(true),
    /** Emit one extra wide event per session, rolling up its turns. */
    sessionEvent: z.boolean().default(false),
    /** Batch events before draining them. */
    batch: z
      .object({
        size: z.number().int().positive(),
        intervalMs: z.number().int().positive(),
      })
      .optional(),
  }),
})
