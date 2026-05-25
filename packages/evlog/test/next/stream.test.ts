import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineStreamedInstrumentation } from '../../src/next/stream'

const { startStreamServer, innerInit, innerOnRequestError, createInstrumentation } = vi.hoisted(() => {
  const innerInit = vi.fn()
  const innerOnRequestError = vi.fn()
  return {
    startStreamServer: vi.fn(),
    innerInit,
    innerOnRequestError,
    createInstrumentation: vi.fn(() => ({ register: innerInit, onRequestError: innerOnRequestError })),
  }
})

vi.mock('../../src/stream', () => ({ startStreamServer }))
vi.mock('../../src/next/instrumentation', () => ({ createInstrumentation }))

describe('defineStreamedInstrumentation', () => {
  beforeEach(() => {
    startStreamServer.mockReset()
    innerInit.mockReset()
    innerOnRequestError.mockReset()
    createInstrumentation.mockClear()
    createInstrumentation.mockImplementation(() => ({ register: innerInit, onRequestError: innerOnRequestError }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not start the stream server when stream option is omitted', async () => {
    const { register } = defineStreamedInstrumentation({ service: 'svc' })
    await register()

    expect(startStreamServer).not.toHaveBeenCalled()
    expect(innerInit).toHaveBeenCalledTimes(1)
  })

  it('does not start the stream server when stream is false', async () => {
    const { register } = defineStreamedInstrumentation({ stream: false })
    await register()

    expect(startStreamServer).not.toHaveBeenCalled()
  })

  it('starts the stream server when stream is true', async () => {
    const drainSpy = vi.fn()
    startStreamServer.mockResolvedValue({ drain: drainSpy })

    const { register } = defineStreamedInstrumentation({ stream: true })
    await register()

    expect(startStreamServer).toHaveBeenCalledWith({})
  })

  it('passes a stream config object through to startStreamServer', async () => {
    const drainSpy = vi.fn()
    startStreamServer.mockResolvedValue({ drain: drainSpy })
    const cfg = { port: 4789, host: '127.0.0.1', token: 't' }

    const { register } = defineStreamedInstrumentation({ stream: cfg })
    await register()

    expect(startStreamServer).toHaveBeenCalledWith(cfg)
  })

  it('composes user drain and server drain so both run on each event', async () => {
    const serverDrain = vi.fn()
    startStreamServer.mockResolvedValue({ drain: serverDrain })
    const userDrain = vi.fn()

    const { register } = defineStreamedInstrumentation({ stream: true, drain: userDrain })
    await register()

    expect(createInstrumentation).toHaveBeenCalled()
    const lastCall = ((createInstrumentation.mock.calls.at(-1)!) as unknown as [unknown])[0] as unknown as { drain?: (ctx: unknown) => Promise<void> }
    const composed = lastCall.drain
    expect(composed).toBeDefined()

    await composed!({ event: { timestamp: 't', level: 'info', service: 's', environment: 'e' } } as never)
    expect(userDrain).toHaveBeenCalledTimes(1)
    expect(serverDrain).toHaveBeenCalledTimes(1)
  })

  it('uses only user drain when server is off', async () => {
    const userDrain = vi.fn()

    const { register } = defineStreamedInstrumentation({ drain: userDrain })
    await register()

    const lastCall = ((createInstrumentation.mock.calls.at(-1)!) as unknown as [unknown])[0] as unknown as { drain?: (ctx: unknown) => Promise<void> }
    const composed = lastCall.drain
    expect(composed).toBe(userDrain)
  })

  it('uses only server drain when no user drain is configured', async () => {
    const serverDrain = vi.fn()
    startStreamServer.mockResolvedValue({ drain: serverDrain })

    const { register } = defineStreamedInstrumentation({ stream: true })
    await register()

    const lastCall = ((createInstrumentation.mock.calls.at(-1)!) as unknown as [unknown])[0] as unknown as { drain?: (ctx: unknown) => Promise<void> }
    const composed = lastCall.drain
    expect(composed).toBeDefined()

    await composed!({ event: { timestamp: 't', level: 'info', service: 's', environment: 'e' } } as never)
    expect(serverDrain).toHaveBeenCalledTimes(1)
  })

  it('omits drain entirely when neither side is configured', async () => {
    const { register } = defineStreamedInstrumentation()
    await register()

    const lastCall = ((createInstrumentation.mock.calls.at(-1)!) as unknown as [unknown])[0] as unknown as { drain?: unknown }
    expect(lastCall.drain).toBeUndefined()
  })

  it('logs and proceeds when startStreamServer rejects', async () => {
    startStreamServer.mockRejectedValue(new Error('port taken'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { register } = defineStreamedInstrumentation({ stream: true })
    await register()

    expect(errorSpy).toHaveBeenCalled()
    const [[message]] = errorSpy.mock.calls
    expect(String(message)).toContain('failed to start stream server')
    expect(innerInit).toHaveBeenCalledTimes(1)
  })

  it('exposes onRequestError via the error-only inner instrumentation', () => {
    const { onRequestError } = defineStreamedInstrumentation({ service: 'svc' })
    expect(onRequestError).toBe(innerOnRequestError)
  })
})
