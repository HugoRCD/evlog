import { describe, expect, it, vi } from 'vitest'
import { bindStreamingResponseLifecycle, isStreamingResponse, shouldDeferEmitForResponse } from '../../src/shared/streamResponse'
import { defined } from '../helpers/defined'

const encoder = new TextEncoder()

function createDeferredStream() {
  let close: (() => void) | undefined
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('hello'))
      close = () => {
        controller.enqueue(encoder.encode(' world'))
        controller.close()
      }
    },
  })
  return {
    stream,
    close: () => defined(close, 'close stream')(),
  }
}

function createImmediateStream(chunks: string[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

describe('streamResponse', () => {
  it('isStreamingResponse detects readable bodies', () => {
    expect(isStreamingResponse(new Response(createImmediateStream(['a'])))).toBe(true)
    expect(isStreamingResponse(new Response(null, { status: 204 }))).toBe(false)
  })

  it('shouldDeferEmitForResponse excludes static string bodies', () => {
    expect(shouldDeferEmitForResponse(new Response('ok'))).toBe(false)
    expect(shouldDeferEmitForResponse(new Response(createImmediateStream(['a']), {
      headers: { 'content-type': 'text/event-stream' },
    }))).toBe(true)
    expect(shouldDeferEmitForResponse(new Response(createImmediateStream(['a']), {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'x-vercel-ai-ui-message-stream': 'v1' },
    }))).toBe(true)
  })

  it('invokes onComplete when the body finishes', async () => {
    const onComplete = vi.fn()
    const source = createDeferredStream()
    const response = bindStreamingResponseLifecycle(
      new Response(source.stream, { status: 202 }),
      onComplete,
    )

    const read = response.text()
    source.close()
    await expect(read).resolves.toBe('hello world')
    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith({ status: 202 })
    })
  })

  it('preserves status, headers, and chunks', async () => {
    const onComplete = vi.fn()
    const response = bindStreamingResponseLifecycle(
      new Response(createImmediateStream(['a', 'b']), {
        status: 207,
        statusText: 'Multi-Status',
        headers: { 'x-stream': 'yes' },
      }),
      onComplete,
    )

    expect(response.status).toBe(207)
    expect(response.statusText).toBe('Multi-Status')
    expect(response.headers.get('x-stream')).toBe('yes')
    await expect(response.text()).resolves.toBe('ab')
    expect(onComplete).toHaveBeenCalledWith({ status: 207 })
  })

  it('records stream errors on complete', async () => {
    const onComplete = vi.fn()
    const source = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error('stream exploded')
      },
    })
    const response = bindStreamingResponseLifecycle(new Response(source, { status: 500 }), onComplete)

    await expect(response.text()).rejects.toThrow('stream exploded')
    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
        status: 500,
        error: expect.objectContaining({ message: 'stream exploded' }),
      }))
    })
  })

  it('returns the original response when the body is already locked', async () => {
    const onComplete = vi.fn()
    const original = new Response(createImmediateStream(['locked']), { status: 200 })
    const body = defined(original.body, 'response body')
    const reader = body.getReader()

    try {
      const response = bindStreamingResponseLifecycle(original, onComplete)
      expect(response).toBe(original)
      await vi.waitFor(() => {
        expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
          error: expect.objectContaining({ message: 'stream is already locked' }),
        }))
      })
    } finally {
      reader.releaseLock()
    }
  })

  it('calls onComplete immediately for responses without a body', async () => {
    const onComplete = vi.fn()
    const response = bindStreamingResponseLifecycle(new Response(null, { status: 204 }), onComplete)
    expect(response.status).toBe(204)
    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith({ status: 204 })
    })
  })
})
