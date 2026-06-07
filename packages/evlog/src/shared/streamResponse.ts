/**
 * Metadata passed to streaming response completion callbacks.
 * Reports the HTTP status and any error that occurred while reading the body.
 */
export interface StreamCompleteMeta {
  /** Final HTTP status code for the response. */
  status: number
  /** Present when the stream body failed before or during completion. */
  error?: Error
}

/**
 * Whether a {@link Response} carries a stream body that may outlive handler return.
 */
export function isStreamingResponse(response: Response): boolean {
  return response.body !== null
}

/**
 * Whether framework integrations should defer wide-event emit until the response
 * body finishes. Static string/JSON bodies are excluded even though they use a
 * {@link ReadableStream} under the hood in the Fetch API.
 */
export function shouldDeferEmitForResponse(response: Response): boolean {
  if (!response.body) return false

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase()

  if (contentType.includes('text/event-stream')) return true
  if (contentType.includes('application/x-ndjson')) return true
  if (response.headers.has('x-vercel-ai-ui-message-stream')) return true
  if (response.headers.get('transfer-encoding')?.toLowerCase().includes('chunked')) return true

  return false
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

function createObservedBody(
  body: ReadableStream<Uint8Array>,
  onDone: () => void | Promise<void>,
  onError: (error: unknown) => void | Promise<void>,
): ReadableStream<Uint8Array> | null {
  if (body.locked) {
    void Promise.resolve(onError(new TypeError('stream is already locked'))).catch((err: unknown) => {
      console.error('[evlog] stream error handling failed:', err)
    })
    return null
  }

  const reader = body.getReader()
  let settled = false

  const settle = (fn: () => void | Promise<void>) => {
    if (settled) return
    settled = true
    void Promise.resolve(fn()).catch((err: unknown) => {
      console.error('[evlog] stream completion handling failed:', err)
    })
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          settle(onDone)
          controller.close()
          return
        }
        controller.enqueue(value)
      } catch (err) {
        settle(() => onError(err))
        controller.error(err)
      }
    },

    async cancel(reason) {
      try {
        await reader.cancel(reason)
      } finally {
        settle(onDone)
      }
    },
  })
}

/**
 * Observe a streaming {@link Response} body and invoke `onComplete` once when
 * the body closes, errors, or is cancelled. Preserves status, headers, and chunks.
 *
 * Non-streaming responses invoke `onComplete` immediately.
 *
 * @internal Used by framework integrations to defer wide-event emit until streams finish.
 */
export function bindStreamingResponseLifecycle(
  response: Response,
  onComplete: (meta: StreamCompleteMeta) => void | Promise<void>,
): Response {
  if (!response.body) {
    void Promise.resolve(onComplete({ status: response.status })).catch((err: unknown) => {
      console.error('[evlog] stream completion handling failed:', err)
    })
    return response
  }

  const body = createObservedBody(
    response.body,
    () => onComplete({ status: response.status }),
    (err) => onComplete({ status: response.status, error: toError(err) }),
  )
  if (!body) return response

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}
