import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getHeaders } from 'h3'
import { createNitroAIStreamLogger } from '../../src/ai/nitro'
import { createRequestLogger, initLogger } from '../../src/logger'
import type { DrainContext, EnrichContext, ServerEvent, WideEvent } from '../../src/types'
import { defined } from '../helpers/defined'

const nitroRuntime = vi.hoisted(() => ({
  app: {
    hooks: {
      callHook: vi.fn(),
    },
  },
}))

vi.mock('h3', () => ({
  getHeaders: vi.fn(),
}))

vi.mock('nitropack/runtime', () => ({
  useNitroApp: () => nitroRuntime.app,
}))

const encoder = new TextEncoder()

function createWaitUntil() {
  const promises: Array<Promise<unknown>> = []
  const waitUntil = vi.fn((promise: Promise<unknown>) => {
    promises.push(promise)
  })
  return { promises, waitUntil }
}

function createEvent(waitUntil?: (promise: Promise<unknown>) => void): {
  event: ServerEvent
  parent: ReturnType<typeof createRequestLogger>
} {
  const parent = createRequestLogger({
    method: 'POST',
    path: '/api/chat',
    requestId: 'parent-req',
  }, { _deferDrain: true })
  parent.set({ service: 'chat-api' })

  return {
    parent,
    event: {
      method: 'POST',
      path: '/api/chat',
      context: {
        log: parent,
        ...(waitUntil
          ? { cloudflare: { context: { waitUntil } } }
          : {}),
      },
    },
  }
}

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

function createStream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

function collectNitroEvents() {
  const order: string[] = []
  const drained: WideEvent[] = []

  nitroRuntime.app.hooks.callHook.mockImplementation((name: string, ctx: EnrichContext | DrainContext) => {
    order.push(name)
    if (name === 'evlog:enrich') {
      ctx.event.enriched = true
    }
    if (name === 'evlog:drain') {
      drained.push(structuredClone(ctx.event))
    }
    return Promise.resolve()
  })

  return { drained, order }
}

describe('createNitroAIStreamLogger', () => {
  beforeEach(() => {
    initLogger({
      env: { service: 'test', environment: 'test' },
      pretty: false,
      silent: true,
      _suppressDrainWarning: true,
    })
    vi.mocked(getHeaders).mockReturnValue({
      authorization: 'Bearer secret',
      'user-agent': 'vitest',
    })
    nitroRuntime.app.hooks.callHook.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('emits a correlated child AI event after the parent request has emitted', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { promises, waitUntil } = createWaitUntil()
    const { event, parent } = createEvent(waitUntil)
    const { drained, order } = collectNitroEvents()
    const source = createDeferredStream()
    const stream = createNitroAIStreamLogger(event, {
      fields: { chatId: 'chat_1', userId: 'user_1' },
    })

    const response = stream.wrapResponse(new Response(source.stream, {
      status: 202,
      headers: {
        'content-type': 'text/plain',
        'x-stream': 'yes',
      },
    }))

    parent.emit({ status: 202 })
    stream.ai.captureEmbed({
      usage: { tokens: 42 },
      model: 'text-embedding-3-small',
    })

    const text = response.text()
    source.close()

    await expect(text).resolves.toBe('hello world')
    await Promise.all(promises)

    expect(warnSpy.mock.calls.some(([message]) => String(message).includes('log.set() called after the wide event was emitted'))).toBe(false)
    expect(waitUntil).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['evlog:enrich', 'evlog:drain'])
    expect(drained).toHaveLength(1)

    const child = defined(drained[0], 'child event')
    expect(child.operation).toBe('ai-stream')
    expect(child._parentRequestId).toBe('parent-req')
    expect(child.requestId).not.toBe('parent-req')
    expect(child.service).toBe('chat-api')
    expect(child.chatId).toBe('chat_1')
    expect(child.userId).toBe('user_1')
    expect(child.enriched).toBe(true)
    expect(child.ai).toMatchObject({
      calls: 1,
      inputTokens: 42,
      outputTokens: 0,
      totalTokens: 42,
      embedding: {
        model: 'text-embedding-3-small',
        tokens: 42,
      },
    })
  })

  it('preserves response status, headers, and streamed body chunks', async () => {
    const { event } = createEvent()
    collectNitroEvents()
    const stream = createNitroAIStreamLogger(event)

    const response = stream.wrapResponse(new Response(createStream(['a', 'b']), {
      status: 207,
      statusText: 'Multi-Status',
      headers: {
        'content-type': 'text/plain',
        'x-stream': 'yes',
      },
    }))

    expect(response.status).toBe(207)
    expect(response.statusText).toBe('Multi-Status')
    expect(response.headers.get('x-stream')).toBe('yes')
    await expect(response.text()).resolves.toBe('ab')
  })

  it('records stream errors on the child event and drains once', async () => {
    const { promises, waitUntil } = createWaitUntil()
    const { event } = createEvent(waitUntil)
    const { drained } = collectNitroEvents()
    const error = new Error('stream exploded')
    const source = new ReadableStream<Uint8Array>({
      pull() {
        throw error
      },
    })
    const stream = createNitroAIStreamLogger(event)
    const response = stream.wrapResponse(new Response(source, { status: 200 }))

    await expect(response.text()).rejects.toThrow('stream exploded')
    await Promise.all(promises)

    expect(drained).toHaveLength(1)
    const child = defined(drained[0], 'child event')
    expect(child.level).toBe('error')
    expect(child.error).toMatchObject({ message: 'stream exploded' })
    const drainCalls = nitroRuntime.app.hooks.callHook.mock.calls.filter(([name]) => name === 'evlog:drain')
    expect(drainCalls).toHaveLength(1)
  })
})
