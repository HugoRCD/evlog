import {
  addImports,
  addPlugin,
  addServerImports,
  addServerPlugin,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'
import type { EnvironmentContext, SamplingConfig } from '../types'

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

    nuxt.options.runtimeConfig.evlog = options
    nuxt.options.runtimeConfig.public.evlog = {
      pretty: options.pretty,
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
