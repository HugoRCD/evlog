import type { Plugin } from 'vite'
import type { EvlogViteOptions } from './types'
import { createAutoInitPlugin } from './auto-init'
import { createAutoImportsPlugin } from './auto-imports'
import { createClientInjectPlugin } from './client-inject'
import { createStripPlugin } from './strip'
import { createSourceLocationPlugin } from './source-location'

/**
 * evlog Vite plugin — brings Nuxt-level DX to any Vite-based framework.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import evlog from 'evlog/vite'
 *
 * export default defineConfig({
 *   plugins: [
 *     evlog({
 *       service: 'my-app',
 *       autoImports: true,
 *       strip: ['debug'],
 *     }),
 *   ],
 * })
 * ```
 */
export default function evlog(options: EvlogViteOptions = {}): Plugin[] {
  const plugins: Plugin[] = []

  plugins.push(createAutoInitPlugin(options))

  if (options.autoImports) {
    const autoImportOpts = typeof options.autoImports === 'object' ? options.autoImports : {}
    plugins.push(createAutoImportsPlugin(autoImportOpts))
  }

  if (options.client) {
    plugins.push(createClientInjectPlugin(options.client))
  }

  if (options.strip && options.strip.length > 0) {
    plugins.push(createStripPlugin(options.strip))
  }

  if (options.sourceLocation) {
    plugins.push(createSourceLocationPlugin(true))
  }

  return plugins
}

export { createAutoInitPlugin } from './auto-init'
export { createAutoImportsPlugin } from './auto-imports'
export { createClientInjectPlugin } from './client-inject'
export { createStripPlugin } from './strip'
export { createSourceLocationPlugin } from './source-location'
export type { EvlogViteOptions, AutoImportsOptions, ClientOptions } from './types'
