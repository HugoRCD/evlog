import type { DrainContext, WideEvent } from 'evlog'

const DEFAULT_BATCH_SIZE = 10
const DEFAULT_TIMEOUT = 5000

export function createHttpDrain(options: {
  url: string
  token: string
  timeout?: number
  batchSize?: number
}) {
  const { url, token, timeout = DEFAULT_TIMEOUT, batchSize = DEFAULT_BATCH_SIZE } = options
  const batch: WideEvent[] = []
  let flushTimer: ReturnType<typeof setTimeout> | undefined

  async function flush() {
    if (batch.length === 0) return

    const eventsToSend = [...batch]
    batch.length = 0
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = undefined
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(eventsToSend),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error')
        const safeText = text.length > 200 ? `${text.slice(0, 200)}...[truncated]` : text
        console.error(`[evlog] HTTP drain failed: ${response.status} ${response.statusText} - ${safeText}`)
      }
    } catch (error) {
      console.error('[evlog] HTTP drain error:', error)
    }
  }

  return async (ctx: DrainContext) => {
    batch.push(ctx.event)

    if (batch.length >= batchSize) {
      await flush()
      return
    }

    if (flushTimer) {
      clearTimeout(flushTimer)
    }

    flushTimer = setTimeout(() => {
      void flush()
    }, 2000)
  }
}
