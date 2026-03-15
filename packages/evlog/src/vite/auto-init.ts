import type { Plugin } from 'vite'
import type { EvlogViteOptions } from './types'

export function createAutoInitPlugin(options: EvlogViteOptions): Plugin {
  const config = buildConfig(options)

  return {
    name: 'evlog:auto-init',
    config() {
      return {
        define: {
          __EVLOG_CONFIG__: JSON.stringify(config),
        },
      }
    },
  }
}

function buildConfig(options: EvlogViteOptions): Record<string, unknown> {
  const env: Record<string, unknown> = {}
  if (options.service) env.service = options.service
  if (options.environment) env.environment = options.environment

  const config: Record<string, unknown> = {}
  if (Object.keys(env).length > 0) config.env = env
  if (options.enabled !== undefined) config.enabled = options.enabled
  if (options.pretty !== undefined) config.pretty = options.pretty
  if (options.silent !== undefined) config.silent = options.silent
  if (options.sampling) config.sampling = options.sampling
  if (options.stringify !== undefined) config.stringify = options.stringify

  return config
}
