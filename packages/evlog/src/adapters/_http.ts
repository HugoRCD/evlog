export interface HttpPostOptions {
  url: string
  headers: Record<string, string>
  body: string
  timeout: number
  label: string
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

export async function httpPost({ url, headers, body, timeout, label, retries = 2 }: HttpPostOptions): Promise<void> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= retries; attempt++) {
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

      if (!isRetryable(error) || attempt === retries) {
        throw lastError
      }

      await new Promise<void>(r => setTimeout(r, 200 * 2 ** attempt))
    }
  }

  throw lastError!
}
