import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWorkersLogger, defineWorkerFetch, initWorkersLogger } from '../src/workers'

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
