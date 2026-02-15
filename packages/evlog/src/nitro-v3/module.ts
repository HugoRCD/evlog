import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NitroModuleOptions } from '../nitro'

export type { NitroModuleOptions }

const _dir = dirname(fileURLToPath(import.meta.url))

export default function evlog(options?: NitroModuleOptions) {
  return {
    name: 'evlog',
    setup(nitro: any) {
      // Push the plugin (no extension — Nitro's bundler resolves it)
      nitro.options.plugins = nitro.options.plugins || []
      nitro.options.plugins.push(resolve(_dir, 'plugin'))

      // Set error handler only if not already configured by user
      if (!nitro.options.errorHandler) {
        nitro.options.errorHandler = resolve(_dir, 'errorHandler')
      }

      // Inject config into runtimeConfig — works in production where the
      // plugin is bundled through Nitro's builder and the virtual
      // runtime-config module resolves correctly.
      nitro.options.runtimeConfig = nitro.options.runtimeConfig || {}
      nitro.options.runtimeConfig.evlog = options || {}

      // In dev mode, Nitro loads plugins externally (not bundled), so the
      // virtual runtime-config module is unreachable and useRuntimeConfig()
      // returns a stub without our values. process.env is inherited by the
      // Worker Threads that run the dev server, making it a reliable bridge.
      // The plugin reads: useRuntimeConfig().evlog ?? process.env.__EVLOG_CONFIG
      process.env.__EVLOG_CONFIG = JSON.stringify(options || {})
    },
  }
}
