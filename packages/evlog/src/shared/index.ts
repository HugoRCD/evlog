/**
 * evlog Toolkit — building blocks for custom adapters, enrichers, plugins,
 * and framework integrations.
 *
 * @beta This API is stable but marked as beta while the first community
 * integrations validate the surface. Breaking changes will follow semver.
 *
 * @example Build a community drain
 * ```ts
 * import { defineHttpDrain, resolveAdapterConfig, type ConfigField } from 'evlog/toolkit'
 *
 * interface MyConfig { apiKey: string; endpoint?: string; timeout?: number }
 * const FIELDS: ConfigField<MyConfig>[] = [{ key: 'apiKey', env: ['MY_API_KEY'] }]
 * export const createMyDrain = (overrides?: Partial<MyConfig>) =>
 *   defineHttpDrain<MyConfig>({
 *     name: 'my',
 *     resolve: async () => {
 *       const cfg = await resolveAdapterConfig<MyConfig>('my', FIELDS, overrides)
 *       return cfg.apiKey ? cfg as MyConfig : null
 *     },
 *     encode: (events, c) => ({
 *       url: `${c.endpoint ?? 'https://api.my.com'}/ingest`,
 *       headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.apiKey}` },
 *       body: JSON.stringify(events),
 *     }),
 *   })
 * ```
 *
 * @example Build a community enricher
 * ```ts
 * import { defineEnricher, getHeader } from 'evlog/toolkit'
 *
 * export const tenantEnricher = defineEnricher<{ id: string }>({
 *   name: 'tenant',
 *   field: 'tenant',
 *   compute: ({ headers }) => {
 *     const id = getHeader(headers, 'x-tenant-id')
 *     return id ? { id } : undefined
 *   },
 * })
 * ```
 *
 * @example Build a community plugin
 * ```ts
 * import { definePlugin } from 'evlog/toolkit'
 *
 * export const requestMetricsPlugin = definePlugin({
 *   name: 'request-metrics',
 *   onRequestFinish({ event, durationMs }) {
 *     if (!event) return
 *     statsd.timing('http.request', durationMs, { path: event.path as string })
 *   },
 * })
 * ```
 *
 * @see https://evlog.dev/frameworks/custom-integration
 */

// Identity / shape helpers.
export * from './define'

// Header utilities (extract / case-insensitive lookup / number parse).
export * from './headers'

// Wide-event helpers (merge, attribute encoding).
export * from './event'

// HTTP transport (POST + retry + timeout).
export * from './http'

// OTEL severity tables (used by OTLP / Sentry / PostHog).
export * from './severity'

// Adapter config resolution (overrides → runtimeConfig → env).
export * from './config'

// Drain factories (`defineDrain`, `defineHttpDrain`).
export * from './drain'

// Enricher factory (`defineEnricher`).
export * from './enricher'

// Plugin contract (`definePlugin`, runner).
export * from './plugin'

// Composition helpers.
export * from './compose'

// Framework integration manifest factory.
export * from './integration'

// Errors / fork / middleware / routes / storage (existing toolkit surface).
export * from './errors'
export * from './fork'
export * from './middleware'
export * from './routes'
export * from './storage'
