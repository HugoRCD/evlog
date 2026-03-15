import {
  addImports,
  addPlugin,
  addServerHandler,
  addServerImports,
  addServerPlugin,
  addVitePlugin,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'
import type { NitroConfig } from 'nitropack'
import type { EnvironmentContext, LogLevel, RouteConfig, SamplingConfig, TransportConfig } from '../types'
import { createStripPlugin } from '../vite/strip'
import { createSourceLocationPlugin } from '../vite/source-location'
import { name, version } from '../../package.json'

interface ModuleAxiomBaseConfig {
  /** Axiom dataset name */
  dataset: string
  /** Axiom API token */
  token: string
  /** Organization ID (required for Personal Access Tokens) */
  orgId?: string
  /** Request timeout in milliseconds. Default: 5000 */
  timeout?: number
}

interface ModuleAxiomEdgeConfig {
  /**
   * Edge URL for Axiom ingest/query endpoints.
   * If no path is provided, uses /v1/ingest/{dataset}.
   * If a custom path is provided, it is used as-is (trailing slash trimmed).
   */
  edgeUrl: string
  /** Mutually exclusive with edgeUrl. */
  baseUrl?: never
}

interface ModuleAxiomEndpointConfig {
  /** Base URL for Axiom API. Uses /v1/datasets/{dataset}/ingest. */
  baseUrl?: string
  /** Mutually exclusive with baseUrl. */
  edgeUrl?: never
}

type ModuleAxiomConfig = ModuleAxiomBaseConfig & (ModuleAxiomEdgeConfig | ModuleAxiomEndpointConfig)

export interface ModuleOptions {
  /**
   * Enable or disable all logging globally.
   * When false, all emits, tagged logs, and request logger operations become no-ops.
   * @default true
   */
  enabled?: boolean

  /**
   * Environment context overrides.
   */
  env?: Partial<EnvironmentContext>

  /**
   * Enable or disable browser console output.
   * When false, client-side logs are suppressed in the browser DevTools console
   * but still sent to the server via transport (if enabled).
   * @default true
   */
  console?: boolean

  /**
   * Enable pretty printing.
   * @default true in development, false in production
   */
  pretty?: boolean

  /**
   * Suppress built-in console output.
   * When true, events are still built, sampled, and passed to drains,
   * but nothing is written to console. Use when drains own the output
   * channel (e.g., stdout-based platforms like GCP Cloud Run, AWS Lambda).
   * @default false
   */
  silent?: boolean

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
  axiom?: ModuleAxiomConfig

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
   * When configured, use `createPostHogDrain()` from `evlog/posthog` to send logs
   * via PostHog Logs (OTLP).
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

  /**
   * Log levels to strip from production builds. Set to [] to disable.
   * @default ['debug']
   */
  strip?: LogLevel[]

  /**
   * Inject source file:line into log calls.
   * When true, active in both dev and prod.
   * When 'dev', active only in development.
   * @default 'dev'
   */
  sourceLocation?: boolean | 'dev'

  /**
   * How long to retain events before cleanup (used by @evlog/nuxthub).
   * Supports "30d" (days), "24h" (hours), "60m" (minutes).
   * @default '30d'
   */
  retention?: string
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name,
    version,
    configKey: name,
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
      enabled: options.enabled ?? true,
      console: options.console,
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
        name: 'setIdentity',
        from: resolver.resolve('../runtime/client/log'),
      },
      {
        name: 'clearIdentity',
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

    const stripLevels = options.strip ?? ['debug']
    if (stripLevels.length > 0) {
      addVitePlugin(createStripPlugin(stripLevels))
    }

    const srcLoc = options.sourceLocation ?? 'dev'
    if (srcLoc === true || (srcLoc === 'dev' && nuxt.options.dev)) {
      addVitePlugin(createSourceLocationPlugin(true))
    }
  },
})
