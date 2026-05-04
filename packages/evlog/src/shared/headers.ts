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

/**
 * Extract headers from Node.js `IncomingHttpHeaders` and filter out sensitive ones.
 * Works with Express, Fastify, and any Node.js HTTP server using `req.headers`.
 */
export function extractSafeNodeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const raw: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue
    raw[key] = Array.isArray(value) ? value.join(', ') : value
  }
  return filterSafeHeaders(raw)
}

/**
 * Case-insensitive header lookup against the safe-filtered shape produced by
 * {@link extractSafeHeaders} / {@link extractSafeNodeHeaders}.
 */
export function getHeader(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) return undefined
  if (headers[name] !== undefined) return headers[name]
  const lowerName = name.toLowerCase()
  if (headers[lowerName] !== undefined) return headers[lowerName]
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) return value
  }
  return undefined
}

/** Parse a header-derived numeric string. Returns `undefined` for empty/invalid input. */
export function normalizeNumber(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
