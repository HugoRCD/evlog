/**
 * Minimal HTTP transport for drain adapters.
 *
 * Handles abort-based timeouts, exponential-backoff retries on `5xx`/`AbortError`/network errors,
 * and a sliced error message so secrets do not leak into logs.
 *
 * @beta Part of `evlog/toolkit` — used by every built-in HTTP drain. Community
 * adapters can use it directly via `defineHttpDrain` or call `httpPost` themselves.
 */

export interface HttpPostOptions {
  /** Full URL to POST the body to. */
  url: string
  /** Request headers (caller is responsible for `Content-Type`). */
  headers: Record<string, string>
  /** Pre-serialized request body. */
  body: string
  /** Abort the request after this many milliseconds. */
  timeout: number
  /** Used in error messages and logs. */
  label: string
  /**
   * Number of retry attempts for transient failures.
   * Retries apply to network errors, aborts, and `5xx` responses with exponential backoff.
   * @default 2
   */
  retries?: number
}

function isRetryable(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof TypeError) return true
  if (error instanceof Error) {
    const match = error.message.match(/API error: (\d+)/)
    if (match) return Number.parseInt(match[1]) >= 500
  }
  return false
}

/**
 * POST a JSON-ish body to a URL with timeout + retry semantics.
 *
 * Throws on non-OK responses with a label-prefixed error including a truncated
 * response body. Safe to use from any drain `send()` function.
 *
 * @beta Part of `evlog/toolkit`.
 */
export async function httpPost({ url, headers, body, timeout, label, retries = 2 }: HttpPostOptions): Promise<void> {
  const normalizedRetries = Number.isFinite(retries) && retries >= 0 ? Math.floor(retries) : 2

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= normalizedRetries; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      })

      if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error')
        const safeText = text.length > 200 ? `${text.slice(0, 200)}...[truncated]` : text
        throw new Error(`${label} API error: ${response.status} ${response.statusText} - ${safeText}`)
      }

      clearTimeout(timeoutId)
      return
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof DOMException && error.name === 'AbortError') {
        lastError = new Error(`${label} request timed out after ${timeout}ms`)
      } else {
        lastError = error as Error
      }

      if (!isRetryable(error) || attempt === normalizedRetries) {
        throw lastError
      }

      await new Promise<void>(r => setTimeout(r, 200 * 2 ** attempt))
    }
  }

  throw lastError!
}
