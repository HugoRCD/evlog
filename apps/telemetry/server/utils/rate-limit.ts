interface RateLimitEntry {
  count: number
  windowStart: number
}

export interface RateLimiterOptions {
  /** Max requests allowed per window. */
  limit: number
  /** Window size in milliseconds. */
  windowMs: number
}

export interface RateLimiter {
  isAllowed: (key: string, now?: number) => boolean
}

/**
 * Best-effort in-memory rate limiter, keyed by caller (e.g. IP address).
 * Per-instance only — serverless functions are ephemeral and run many
 * instances in parallel, so this is a floor, not a ceiling. Real defense
 * against abuse is Vercel's edge network / firewall in front of this route.
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const hits = new Map<string, RateLimitEntry>()

  return {
    isAllowed(key: string, now = Date.now()): boolean {
      const entry = hits.get(key)
      if (!entry || now - entry.windowStart >= options.windowMs) {
        hits.set(key, { count: 1, windowStart: now })
        return true
      }
      if (entry.count >= options.limit) return false
      entry.count++
      return true
    },
  }
}
