import {
  addImports,
  addPlugin,
  addServerHandler,
  addServerImports,
  addServerPlugin,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'
import type { NitroConfig } from 'nitropack'
import type { EnvironmentContext, RouteConfig, SamplingConfig, TransportConfig } from '../types'

export interface ModuleOptions {
  /**
   * Environment context overrides.
   */
  env?: Partial<EnvironmentContext>

  /**
   * Enable pretty printing.
   * @default true in development, false in production
   */
  pretty?: boolean

  /**
   * Route patterns to include in logging.
   * Supports glob patterns like '/api/**'.
   * If not set, all routes are logged.
   * @example ['/api/**', '/auth/**']
   */
  include?: string[]

  /**
   * Route patterns to exclude from logging.
   * Supports glob patterns like '/api/_nuxt_icon/**'.
   * Exclusions take precedence over inclusions.
   * @example ['/api/_nuxt_icon/**', '/health']
   */
  exclude?: string[]

  /**
   * Route-specific service configuration.
   * Allows setting different service names for different routes.
   * Patterns are matched using glob syntax.
   *
   * @example
   * ```ts
   * routes: {
   *   '/api/foo/**': { service: 'service1' },
   *   '/api/bar/**': { service: 'service2' }
   * }
   * ```
   */
  routes?: Record<string, RouteConfig>

  /**
   * Sampling configuration for filtering logs.
   * Allows configuring what percentage of logs to keep per level.
   *
   * @example
   * ```ts
   * sampling: {
   *   rates: {
   *     info: 10,    // Keep 10% of info logs
   *     warn: 50,    // Keep 50% of warning logs
   *     debug: 5,    // Keep 5% of debug logs
   *     error: 100,  // Always keep errors (default)
   *   }
   * }
   * ```
   */
  sampling?: SamplingConfig

  /**
   * Transport configuration for sending client logs to the server.
   *
   * @example
   * ```ts
   * transport: {
   *   enabled: true,  // Send logs to server API
   *   endpoint: '/api/_evlog/ingest'  // Custom endpoint
   * }
   * ```
   */
  transport?: TransportConfig

  /**
   * Axiom adapter configuration.
   * When configured, use `createAxiomDrain()` from `evlog/axiom` to send logs.
   *
   * @example
   * ```ts
   * axiom: {
   *   dataset: 'my-app-logs',
   *   token: process.env.AXIOM_TOKEN,
   * }
   * ```
   */
  axiom?: {
    /** Axiom dataset name */
    dataset: string
    /** Axiom API token */
    token: string
    /** Organization ID (required for Personal Access Tokens) */
    orgId?: string
    /** Base URL for Axiom API. Default: https://api.axiom.co */
    baseUrl?: string
    /** Request timeout in milliseconds. Default: 5000 */
    timeout?: number
  }

  /**
   * OTLP adapter configuration.
   * When configured, use `createOTLPDrain()` from `evlog/otlp` to send logs.
   *
   * @example
   * ```ts
   * otlp: {
   *   endpoint: 'http://localhost:4318',
   *   headers: {
   *     'Authorization': `Basic ${process.env.GRAFANA_TOKEN}`,
   *   },
   * }
   * ```
   */
  otlp?: {
    /** OTLP HTTP endpoint (e.g., http://localhost:4318) */
    endpoint: string
    /** Override service name (defaults to event.service) */
    serviceName?: string
    /** Additional resource attributes */
    resourceAttributes?: Record<string, string | number | boolean>
    /** Custom headers (e.g., for authentication) */
    headers?: Record<string, string>
    /** Request timeout in milliseconds. Default: 5000 */
    timeout?: number
  }

  /**
   * PostHog adapter configuration.
   * When configured, use `createPostHogDrain()` from `evlog/posthog` to send logs.
   *
   * @example
   * ```ts
   * posthog: {
   *   apiKey: process.env.POSTHOG_API_KEY,
   * }
   * ```
   */
  posthog?: {
    /** PostHog project API key */
    apiKey: string
    /** PostHog host URL. Default: https://us.i.posthog.com */
    host?: string
    /** PostHog event name. Default: evlog_wide_event */
    eventName?: string
    /** Override distinct_id (defaults to event.service) */
    distinctId?: string
    /** Request timeout in milliseconds. Default: 5000 */
    timeout?: number
  }

  /**
   * Sentry adapter configuration.
   * When configured, use `createSentryDrain()` from `evlog/sentry` to send logs.
   *
   * @example
   * ```ts
   * sentry: {
   *   dsn: process.env.SENTRY_DSN,
   * }
   * ```
   */
  sentry?: {
    /** Sentry DSN */
    dsn: string
    /** Environment override (defaults to event.environment) */
    environment?: string
    /** Release version override (defaults to event.version) */
    release?: string
    /** Additional tags to attach as attributes */
    tags?: Record<string, string>
    /** Request timeout in milliseconds. Default: 5000 */
    timeout?: number
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'evlog',
    configKey: 'evlog',
    docs: 'https://evlog.dev',
  },
  defaults: {},
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    const transportEnabled = options.transport?.enabled ?? false
    const transportEndpoint = options.transport?.endpoint ?? '/api/_evlog/ingest'

    // Register custom error handler for proper EvlogError serialization
    // Only set if not already configured to avoid overwriting user's custom handler
    // @ts-expect-error nitro:config hook exists but is not in NuxtHooks type
    nuxt.hook('nitro:config', (nitroConfig: NitroConfig) => {
      nitroConfig.errorHandler = nitroConfig.errorHandler || resolver.resolve('../nitro/errorHandler')
    })

    nuxt.options.runtimeConfig.evlog = options
    nuxt.options.runtimeConfig.public.evlog = {
      pretty: options.pretty,
      transport: {
        enabled: transportEnabled,
        endpoint: transportEndpoint,
      },
    }

    if (transportEnabled) {
      addServerHandler({
        route: transportEndpoint,
        method: 'post',
        handler: resolver.resolve('../runtime/server/routes/_evlog/ingest.post'),
      })
    }

    addServerPlugin(resolver.resolve('../nitro/plugin'))

    addPlugin({
      src: resolver.resolve('../runtime/client/plugin'),
      mode: 'client',
    })

    addImports([
      {
        name: 'log',
        from: resolver.resolve('../runtime/client/log'),
      },
      {
        name: 'createEvlogError',
        from: resolver.resolve('../error'),
      },
      {
        name: 'parseError',
        from: resolver.resolve('../runtime/utils/parseError'),
      },
    ])

    addServerImports([
      {
        name: 'useLogger',
        from: resolver.resolve('../runtime/server/useLogger'),
      },
      {
        name: 'log',
        from: resolver.resolve('../logger'),
      },
      {
        name: 'createEvlogError',
        from: resolver.resolve('../error'),
      },
    ])
  },
})
