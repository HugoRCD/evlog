import type { Plugin } from 'vite'
import type { ClientOptions } from './types'

export function createClientInjectPlugin(clientOptions: ClientOptions): Plugin {
  let isDev = true

  return {
    name: 'evlog:client-inject',

    configResolved(config) {
      isDev = config.command === 'serve'
    },

    transformIndexHtml() {
      const config: Record<string, unknown> = {}
      config.service = clientOptions.service ?? 'client'
      if (clientOptions.console !== undefined) config.console = clientOptions.console
      config.pretty = clientOptions.pretty ?? isDev
      if (clientOptions.transport) config.transport = clientOptions.transport

      const configJson = JSON.stringify(config)

      return [
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: `import{initLog}from'evlog/client'\ninitLog(${configJson})`,
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}
