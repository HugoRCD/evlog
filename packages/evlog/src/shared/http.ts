/**
 * Minimal HTTP transport for drain adapters: abort-based timeouts, exponential
 * backoff on `5xx` / network errors, response bodies truncated in error messages.
 */

export interface HttpPostOptions {
  url: string
  /** Caller is responsible for `Content-Type`. */
  headers: Record<string, string>
  /** Pre-serialized request body. */
  body: string
  /** Abort the request after this many milliseconds. */
  timeout: number
  /** Prefix used in error messages. */
  label: string
  /**
   * Retries network errors, aborts, and `5xx` responses with exponential backoff.
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
 * POST a body with timeout + retry. Throws label-prefixed errors with a
 * truncated response body. Safe to call from any drain `send()`.
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
