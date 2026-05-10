import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorkersLogger, defineWorkerFetch, initWorkersLogger } from '../../src/workers'

describe('createWorkersLogger - request shape', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    initWorkersLogger({ pretty: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('extracts cf-ray as default requestId', () => {
    const request = new Request('https://example.com/api/users', {
      headers: { 'cf-ray': 'ray-123' },
    })
    const log = createWorkersLogger(request)
    expect(log.getContext().requestId).toBe('ray-123')
  })

  it('lets options.requestId override cf-ray', () => {
    const request = new Request('https://example.com/api/users', {
      headers: { 'cf-ray': 'ray-123' },
    })
    const log = createWorkersLogger(request, { requestId: 'custom-id' })
    expect(log.getContext().requestId).toBe('custom-id')
  })

  it('captures method and pathname from the URL', () => {
    const request = new Request('https://example.com/api/orders/42?q=1', { method: 'POST' })
    const log = createWorkersLogger(request)
    const ctx = log.getContext()
    expect(ctx.method).toBe('POST')
    expect(ctx.path).toBe('/api/orders/42')
  })

  it('captures traceparent header', () => {
    const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'
    const request = new Request('https://example.com/x', {
      headers: { traceparent },
    })
    const log = createWorkersLogger(request)
    expect(log.getContext().traceparent).toBe(traceparent)
  })

  it('reads cf.colo / cf.country / cf.asn when present and skips junk', () => {
    const request = new Request('https://example.com/x')
    Object.defineProperty(request, 'cf', {
      value: { colo: 'CDG', country: 'FR', asn: 13335, junk: { nested: true }, score: 'not-a-number' },
    })
    const log = createWorkersLogger(request)
    const ctx = log.getContext()
    expect(ctx.colo).toBe('CDG')
    expect(ctx.country).toBe('FR')
    expect(ctx.asn).toBe(13335)
    expect(ctx).not.toHaveProperty('junk')
    expect(ctx).not.toHaveProperty('score')
  })

  it('omits cf.* fields when request.cf is missing', () => {
    const request = new Request('https://example.com/x')
    const log = createWorkersLogger(request)
    const ctx = log.getContext()
    expect(ctx.colo).toBeUndefined()
    expect(ctx.country).toBeUndefined()
    expect(ctx.asn).toBeUndefined()
  })

  it('omits cf.* fields when request.cf is not a plain object', () => {
    const request = new Request('https://example.com/x')
    Object.defineProperty(request, 'cf', { value: 'not-an-object' })
    const log = createWorkersLogger(request)
    const ctx = log.getContext()
    expect(ctx.colo).toBeUndefined()
    expect(ctx.country).toBeUndefined()
  })

  it('collects only the headers listed in options.headers (case-insensitive)', () => {
    const request = new Request('https://example.com/x', {
      headers: {
        'X-User-Agent': 'TestBot/1.0',
        'authorization': 'Bearer secret',
        'X-Trace': 'abc',
      },
    })
    const log = createWorkersLogger(request, { headers: ['x-user-agent', 'X-TRACE'] })
    const ctx = log.getContext()
    expect(ctx.requestHeaders).toEqual({
      'x-user-agent': 'TestBot/1.0',
      'x-trace': 'abc',
    })
  })

  it('omits requestHeaders when none of the requested headers are present', () => {
    const request = new Request('https://example.com/x', {
      headers: { 'x-other': 'value' },
    })
    const log = createWorkersLogger(request, { headers: ['x-missing'] })
    expect(log.getContext().requestHeaders).toBeUndefined()
  })

  it('omits requestHeaders when options.headers is empty', () => {
    const request = new Request('https://example.com/x', {
      headers: { 'x-trace': 'value' },
    })
    const log = createWorkersLogger(request, { headers: [] })
    expect(log.getContext().requestHeaders).toBeUndefined()
  })
})

describe('createWorkersLogger - waitUntil binding', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses options.waitUntil when provided directly', async () => {
    const drain = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(console, 'info').mockImplementation(() => {})

    const waitUntil = vi.fn()
    initWorkersLogger({ pretty: false, drain })

    const request = new Request('https://example.com/x')
    const log = createWorkersLogger(request, { waitUntil })
    log.emit()

    await vi.waitFor(() => expect(drain).toHaveBeenCalledTimes(1))
    expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise))
  })

  it('prefers options.waitUntil over executionCtx', async () => {
    const drain = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(console, 'info').mockImplementation(() => {})

    const directWaitUntil = vi.fn()
    const ctxWaitUntil = vi.fn()
    initWorkersLogger({ pretty: false, drain })

    const request = new Request('https://example.com/x')
    const log = createWorkersLogger(request, {
      waitUntil: directWaitUntil,
      executionCtx: { waitUntil: ctxWaitUntil },
    })
    log.emit()

    await vi.waitFor(() => expect(drain).toHaveBeenCalledTimes(1))
    expect(directWaitUntil).toHaveBeenCalled()
    expect(ctxWaitUntil).not.toHaveBeenCalled()
  })
})

describe('createWorkersLogger + waitUntil', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('defineWorkerFetch wires executionCtx so emit registers drain with waitUntil', async () => {
    const drain = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(console, 'info').mockImplementation(() => {})

    const waitUntil = vi.fn()
    const executionCtx = { waitUntil }

    initWorkersLogger({ pretty: false, drain })

    const worker = defineWorkerFetch((_request, _env, _ctx, log) => {
      log.emit()
      return new Response('ok')
    })

    const request = new Request('https://example.com/api')
    await worker.fetch(request, {}, executionCtx)

    await vi.waitFor(() => expect(drain).toHaveBeenCalledTimes(1))
    expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise))
    const [[scheduled]] = waitUntil.mock.calls
    await scheduled
  })

  it('binds executionCtx.waitUntil and registers drain work on emit', async () => {
    const drain = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(console, 'info').mockImplementation(() => {})

    const waitUntil = vi.fn()
    const executionCtx = { waitUntil }

    initWorkersLogger({ pretty: false, drain })

    const request = new Request('https://example.com/api')
    const log = createWorkersLogger(request, {
      requestId: 'test-req',
      executionCtx,
    })

    log.emit()

    await vi.waitFor(() => expect(drain).toHaveBeenCalledTimes(1))
    expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise))

    const [[scheduled]] = waitUntil.mock.calls
    await scheduled
  })
})
