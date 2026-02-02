import {
  addImports,
  addPlugin,
  addServerHandler,
  addServerImports,
  addServerPlugin,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'
import type { EnvironmentContext, SamplingConfig, TransportConfig } from '../types'

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
