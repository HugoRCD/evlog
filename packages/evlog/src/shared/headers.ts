import { filterSafeHeaders } from '../utils'

/**
 * Extract headers from a Web API `Headers` object and filter out sensitive ones.
 * Works with any runtime that supports the standard `Headers` API (Hono, Elysia,
 * Nitro v3, Cloudflare Workers, Bun, Deno, etc.).
 */
export function extractSafeHeaders(headers: Headers): Record<string, string> {
  const raw: Record<string, string> = {}
  headers.forEach((value, key) => {
    raw[key] = value
  })
  return filterSafeHeaders(raw)
}
