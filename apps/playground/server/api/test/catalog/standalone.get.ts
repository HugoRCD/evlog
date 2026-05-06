import { rateLimited } from '~~/server/utils/errors'

/**
 * Standalone factory created with `defineError(code, options)` — same call-site
 * shape as a catalog entry but no prefix derivation. Use this pattern for
 * one-off errors or for very large repos that prefer one factory per file.
 */
export default defineEventHandler(() => {
  throw rateLimited({ retryAfter: 30 })
})
