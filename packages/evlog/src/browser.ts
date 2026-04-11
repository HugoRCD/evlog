import type { HttpDrainConfig, HttpLogDrainOptions } from './http'
import { createHttpDrain, createHttpLogDrain } from './http'

/**
 * @deprecated Import `HttpDrainConfig` from `evlog/http` instead. The `evlog/browser` entry point will be removed in the next **major** release.
 */
export type BrowserDrainConfig = HttpDrainConfig

/**
 * @deprecated Import `HttpLogDrainOptions` from `evlog/http` instead. The `evlog/browser` entry point will be removed in the next **major** release.
 */
export type BrowserLogDrainOptions = HttpLogDrainOptions

/**
 * @deprecated Use `createHttpDrain` from `evlog/http` instead. The `evlog/browser` entry point will be removed in the next **major** release.
 */
export function createBrowserDrain(config: BrowserDrainConfig) {
  return createHttpDrain(config)
}

/**
 * @deprecated Use `createHttpLogDrain` from `evlog/http` instead. The `evlog/browser` entry point will be removed in the next **major** release.
 */
export function createBrowserLogDrain(options: BrowserLogDrainOptions) {
  return createHttpLogDrain(options)
}
