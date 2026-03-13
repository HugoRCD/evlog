/**
 * evlog Toolkit — building blocks for custom framework integrations.
 *
 * @beta This API is stable but marked as beta while the first community
 * integrations validate the surface. Breaking changes will follow semver.
 *
 * @example
 * ```ts
 * import type { RequestLogger } from 'evlog'
 * import {
 *   createMiddlewareLogger,
 *   extractSafeHeaders,
 *   createLoggerStorage,
 *   type BaseEvlogOptions,
 * } from 'evlog/toolkit'
 * ```
 *
 * @see https://evlog.dev/frameworks/custom-integration
 */
export * from './errors'
export * from './headers'
export * from './middleware'
export * from './routes'
export * from './storage'
