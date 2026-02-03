import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock h3 functions
const mockSetResponseStatus = vi.fn()
const mockSetResponseHeader = vi.fn()
const mockSend = vi.fn()

vi.mock('h3', () => ({
  setResponseStatus: (...args: unknown[]) => mockSetResponseStatus(...args),
  setResponseHeader: (...args: unknown[]) => mockSetResponseHeader(...args),
  send: (...args: unknown[]) => mockSend(...args),
}))

// Mock nitropack/runtime
vi.mock('nitropack/runtime', () => ({
  defineNitroErrorHandler: <T>(handler: T) => handler,
}))

// eslint-disable-next-line import/first -- Must import after vi.mock
import errorHandler from '../src/nitro/errorHandler'

describe('errorHandler', () => {
  const mockEvent = { node: { req: {}, res: {} } }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('EvlogError handling', () => {
    it('serializes EvlogError with all data fields', () => {
      const evlogError = {
        name: 'EvlogError',
        message: 'Payment failed',
        status: 402,
        statusText: 'Payment failed',
        statusCode: 402,
        statusMessage: 'Payment failed',
        data: {
          why: 'Card declined',
          fix: 'Try another card',
          link: 'https://docs.example.com',
        },
        cause: undefined,
      }

      errorHandler(evlogError as Error, mockEvent)

      expect(mockSetResponseStatus).toHaveBeenCalledWith(mockEvent, 402)
      expect(mockSetResponseHeader).toHaveBeenCalledWith(mockEvent, 'Content-Type', 'application/json')

      const sentBody = JSON.parse(mockSend.mock.calls[0][1])
      expect(sentBody.status).toBe(402)
      expect(sentBody.statusCode).toBe(402)
      expect(sentBody.message).toBe('Payment failed')
      expect(sentBody.data).toEqual({
        why: 'Card declined',
        fix: 'Try another card',
        link: 'https://docs.example.com',
      })
    })

    it('derives HTTP status from evlogError when in error.cause', () => {
      const evlogError = {
        name: 'EvlogError',
        message: 'Not found',
        status: 404,
        statusText: 'Not found',
        statusCode: 404,
        statusMessage: 'Not found',
        data: { why: 'Resource does not exist' },
        cause: undefined,
      }

      const wrapperError = {
        name: 'Error',
        message: 'Wrapper error',
        cause: evlogError,
      }

      errorHandler(wrapperError as Error, mockEvent)

      // HTTP status should come from evlogError, not wrapper
      expect(mockSetResponseStatus).toHaveBeenCalledWith(mockEvent, 404)

      const sentBody = JSON.parse(mockSend.mock.calls[0][1])
      expect(sentBody.status).toBe(404)
      expect(sentBody.statusCode).toBe(404)
      expect(sentBody.data).toEqual({ why: 'Resource does not exist' })
    })

    it('serializes cause when present', () => {
      const cause = new Error('Connection refused')
      cause.name = 'NetworkError'
      const evlogError = {
        name: 'EvlogError',
        message: 'API unavailable',
        status: 503,
        statusText: 'API unavailable',
        statusCode: 503,
        statusMessage: 'API unavailable',
        cause,
      }

      errorHandler(evlogError as unknown as Error, mockEvent)

      const sentBody = JSON.parse(mockSend.mock.calls[0][1])
      expect(sentBody.cause).toEqual({ name: 'NetworkError', message: 'Connection refused' })
    })

    it('defaults to 500 when no status on evlogError', () => {
      const evlogError = {
        name: 'EvlogError',
        message: 'Unknown error',
      }

      errorHandler(evlogError as Error, mockEvent)

      expect(mockSetResponseStatus).toHaveBeenCalledWith(mockEvent, 500)
    })
  })

  describe('non-EvlogError handling', () => {
    it('uses Nitro-compatible format for standard errors', () => {
      const error = {
        name: 'Error',
        message: 'Something went wrong',
        statusCode: 400,
      }

      errorHandler(error as Error, mockEvent)

      expect(mockSetResponseStatus).toHaveBeenCalledWith(mockEvent, 400)

      const sentBody = JSON.parse(mockSend.mock.calls[0][1])
      expect(sentBody.statusCode).toBe(400)
      expect(sentBody.statusMessage).toBe('Something went wrong')
      expect(sentBody.message).toBe('Something went wrong')
      // Should NOT include extended fields
      expect(sentBody.data).toBeUndefined()
      expect(sentBody.status).toBeUndefined()
    })

    it('defaults to 500 for errors without status', () => {
      const error = {
        name: 'Error',
        message: 'Generic error',
      }

      errorHandler(error as Error, mockEvent)

      expect(mockSetResponseStatus).toHaveBeenCalledWith(mockEvent, 500)
    })

    it('uses "Internal Server Error" when no message', () => {
      const error = {
        name: 'Error',
        message: '',
      }

      errorHandler(error as Error, mockEvent)

      const sentBody = JSON.parse(mockSend.mock.calls[0][1])
      expect(sentBody.message).toBe('Internal Server Error')
      expect(sentBody.statusMessage).toBe('Internal Server Error')
    })
  })
})
