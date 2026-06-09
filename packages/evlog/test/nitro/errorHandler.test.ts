import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { defined } from '../helpers/defined'

const mockSetResponseStatus = vi.fn()
const mockSetResponseHeader = vi.fn()
const mockSend = vi.fn()
const mockGetRequestURL = vi.fn(() => ({ pathname: '/api/test' }))

vi.mock('h3', () => ({
  setResponseStatus: (event: H3Event, status: number) => mockSetResponseStatus(event, status),
  setResponseHeader: (event: H3Event, name: string, value: string) => mockSetResponseHeader(event, name, value),
  send: (event: H3Event, body: string) => mockSend(event, body),
  getRequestURL: (event: H3Event, options?: { xForwardedHost?: boolean }) => mockGetRequestURL(event, options),
}))

vi.mock('nitropack/runtime', () => ({
  defineNitroErrorHandler: <T>(handler: T) => handler,
}))

import { createError } from '../../src/error'
import errorHandler from '../../src/nitro/errorHandler'

const mockEvent = { node: { req: {}, res: {} }, _handled: false } as H3Event & { _handled: boolean }

const defaultHandlerMock = vi.fn().mockResolvedValue(undefined)

function invokeErrorHandler(error: Error) {
  return errorHandler(error, mockEvent, { defaultHandler: defaultHandlerMock })
}

describe('errorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('__EVLOG_CONFIG', JSON.stringify({ pretty: true }))
    mockEvent._handled = false
  })

  it('marks the h3 event handled so Nitro dev handler does not run', async () => {
    await invokeErrorHandler(new Error('boom'))
    expect(mockEvent._handled).toBe(true)
  })

  it('clears unhandled flag in dev pretty mode', async () => {
    vi.stubEnv('__EVLOG_CONFIG', JSON.stringify({ pretty: true }))
    const error = Object.assign(new Error('boom'), { unhandled: true, fatal: true })
    await invokeErrorHandler(error)
    expect(error.unhandled).toBe(false)
    expect(error.fatal).toBe(false)
  })

  it('calls defaultHandler when devErrorHandler is nitro', async () => {
    vi.stubEnv('__EVLOG_CONFIG', JSON.stringify({ pretty: true, devErrorHandler: 'nitro' }))
    const defaultHandler = vi.fn().mockResolvedValue(undefined)
    const error = new Error('boom')
    await errorHandler(error, mockEvent, { defaultHandler })
    expect(defaultHandler).toHaveBeenCalledWith(error, mockEvent, { silent: false })
  })

  describe('EvlogError handling', () => {
    it('serializes EvlogError with all data fields', async () => {
      const evlogError = Object.assign(new Error('Payment failed'), {
        name: 'EvlogError',
        status: 402,
        statusText: 'Payment failed',
        statusCode: 402,
        statusMessage: 'Payment failed',
        data: {
          why: 'Card declined',
          fix: 'Try another card',
          link: 'https://docs.example.com',
        },
      })

      await invokeErrorHandler(evlogError)

      expect(mockSetResponseStatus).toHaveBeenCalledWith(mockEvent, 402)
      expect(mockSetResponseHeader).toHaveBeenCalledWith(mockEvent, 'Content-Type', 'application/json')

      const sentBody = JSON.parse(defined(mockSend.mock.calls[0]?.[1], 'response body'))
      expect(sentBody.statusCode).toBe(402)
      expect(sentBody.message).toBe('Payment failed')
      expect(sentBody.url).toBe('/api/test')
      expect(sentBody.error).toBe(true)
      expect(sentBody.data).toEqual({
        why: 'Card declined',
        fix: 'Try another card',
        link: 'https://docs.example.com',
      })
    })

    it('derives HTTP status from evlogError when in error.cause', async () => {
      const evlogError = Object.assign(new Error('Not found'), {
        name: 'EvlogError',
        status: 404,
        statusText: 'Not found',
        statusCode: 404,
        statusMessage: 'Not found',
        data: { why: 'Resource does not exist' },
      })

      const wrapperError = Object.assign(new Error('Wrapper error'), { cause: evlogError })

      await invokeErrorHandler(wrapperError)

      expect(mockSetResponseStatus).toHaveBeenCalledWith(mockEvent, 404)

      const sentBody = JSON.parse(defined(mockSend.mock.calls[0]?.[1], 'response body'))
      expect(sentBody.statusCode).toBe(404)
      expect(sentBody.data).toEqual({ why: 'Resource does not exist' })
    })

    it('defaults to 500 when no status on evlogError', async () => {
      const evlogError = Object.assign(new Error('Unknown error'), { name: 'EvlogError' })

      await invokeErrorHandler(evlogError)

      expect(mockSetResponseStatus).toHaveBeenCalledWith(mockEvent, 500)
    })

    it('does not expose internal context on EvlogError responses', async () => {
      const err = createError({
        message: 'Not allowed',
        status: 403,
        why: 'Insufficient role',
        internal: { userId: 'u-internal', rawPolicy: 'deny:admin' },
      })

      await invokeErrorHandler(err)

      const sentBody = JSON.parse(defined(mockSend.mock.calls[0]?.[1], 'response body'))
      expect(sentBody.internal).toBeUndefined()
      expect(JSON.stringify(sentBody)).not.toContain('u-internal')
      expect(JSON.stringify(sentBody)).not.toContain('rawPolicy')
      expect(sentBody.data).toEqual({
        why: 'Insufficient role',
        fix: undefined,
        link: undefined,
      })
    })
  })

  describe('non-EvlogError handling', () => {
    it('uses Nitro-compatible format for standard errors', async () => {
      const error = Object.assign(new Error('Something went wrong'), {
        statusCode: 400,
      })

      await invokeErrorHandler(error)

      expect(mockSetResponseStatus).toHaveBeenCalledWith(mockEvent, 400)

      const sentBody = JSON.parse(defined(mockSend.mock.calls[0]?.[1], 'response body'))
      expect(sentBody.statusCode).toBe(400)
      expect(sentBody.statusMessage).toBe('Something went wrong')
      expect(sentBody.message).toBe('Something went wrong')
      expect(sentBody.url).toBe('/api/test')
      expect(sentBody.error).toBe(true)
      expect(sentBody.data).toBeUndefined()
    })

    it('defaults to 500 for errors without status', async () => {
      const error = new Error('Generic error')

      await invokeErrorHandler(error)

      expect(mockSetResponseStatus).toHaveBeenCalledWith(mockEvent, 500)
    })

    it('uses "Internal Server Error" when no message', async () => {
      const error = new Error('')

      await invokeErrorHandler(error)

      const sentBody = JSON.parse(defined(mockSend.mock.calls[0]?.[1], 'response body'))
      expect(sentBody.message).toBe('Internal Server Error')
      expect(sentBody.statusMessage).toBe('Internal Server Error')
    })

    it('sanitizes 5xx error messages in production', async () => {
      vi.stubEnv('NODE_ENV', 'production')

      const error = Object.assign(new Error('Database connection failed: password invalid'), {
        statusCode: 500,
      })

      await invokeErrorHandler(error)

      const sentBody = JSON.parse(defined(mockSend.mock.calls[0]?.[1], 'response body'))
      expect(sentBody.message).toBe('Internal Server Error')
      expect(sentBody.statusMessage).toBe('Internal Server Error')
    })

    it('preserves 4xx error messages in production', async () => {
      vi.stubEnv('NODE_ENV', 'production')

      const error = Object.assign(new Error('Invalid email format'), {
        statusCode: 400,
      })

      await invokeErrorHandler(error)

      const sentBody = JSON.parse(defined(mockSend.mock.calls[0]?.[1], 'response body'))
      expect(sentBody.message).toBe('Invalid email format')
      expect(sentBody.statusMessage).toBe('Invalid email format')
    })
  })
})
