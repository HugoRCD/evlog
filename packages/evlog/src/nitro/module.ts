import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Nitro } from 'nitropack'
import type { NitroModuleOptions } from '../nitro'

export type { NitroModuleOptions }

const _dir = dirname(fileURLToPath(import.meta.url))

// Nitro raw-interpolates these paths into JS string literals when generating
// the #nitro/virtual/plugins and #nitro/virtual/error-handler modules, so
// Windows backslashes would be parsed as escape sequences (\n, \v, …) and
// break module resolution. Normalize to POSIX separators.
function resolveModulePath(name: string): string {
  return resolve(_dir, name).replace(/\\/g, '/')
}

export default function evlog(options?: NitroModuleOptions) {
  return {
    name: 'evlog',
    setup(nitro: Nitro) {
      // Push the plugin (no extension — Nitro's bundler resolves it)
      nitro.options.plugins = nitro.options.plugins || []
      nitro.options.plugins.push(resolveModulePath('plugin'))

      // Set error handler only if not already configured by user
      if (!nitro.options.errorHandler) {
        nitro.options.errorHandler = resolveModulePath('errorHandler')
      }

      // explicitly tell nitro to bundle evlog's files to correctly resolve nitro dependencies
      // in nitro v2 we can only disable externals globally

      nitro.options.noExternals = true

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

export { useLogger } from '../runtime/server/useLogger'
