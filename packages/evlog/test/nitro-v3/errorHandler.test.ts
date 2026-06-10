import { beforeEach, describe, expect, it, vi } from 'vitest'

declare global {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  var __EVLOG_CONFIG__: unknown
}

vi.mock('nitro', () => ({
  defineErrorHandler: <T>(handler: T) => handler,
}))

import { createError } from '../../src/error'
import errorHandler from '../../src/nitro-v3/errorHandler'
import { resetNitroDevOverlayCache, shouldSuppressNitroDevOverlay } from '../../src/nitro'

const defaultHandlerMock = vi.fn().mockResolvedValue(undefined)

const mockEvent = {
  req: { url: 'http://localhost/api/test' },
  _handled: false,
} as { req: { url: string }; _handled: boolean }

function invokeErrorHandler(error: Error, event = mockEvent) {
  return errorHandler(error, event, { defaultHandler: defaultHandlerMock })
}

async function readJson(response: Response) {
  return JSON.parse(await response.text())
}

describe('nitro-v3 errorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('__EVLOG_CONFIG', JSON.stringify({ pretty: true }))
    delete globalThis.__EVLOG_CONFIG__
    resetNitroDevOverlayCache()
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

  it('calls defaultHandler when dev preset is nitro', async () => {
    vi.stubEnv('__EVLOG_CONFIG', JSON.stringify({ pretty: true, dev: 'nitro' }))
    resetNitroDevOverlayCache()
    const defaultHandler = vi.fn().mockResolvedValue(undefined)
    const error = new Error('boom')

    await errorHandler(error, mockEvent, { defaultHandler })

    expect(defaultHandler).toHaveBeenCalledWith(error, mockEvent, { silent: false })
  })

  it('reads inlined __EVLOG_CONFIG__ for overlay suppression', () => {
    vi.stubEnv('__EVLOG_CONFIG', undefined)
    globalThis.__EVLOG_CONFIG__ = { pretty: true, dev: 'nitro' }
    resetNitroDevOverlayCache()
    expect(shouldSuppressNitroDevOverlay()).toBe(false)
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

      const response = await invokeErrorHandler(evlogError)

      expect(response.status).toBe(402)
      expect(response.headers.get('Content-Type')).toBe('application/json')

      const body = await readJson(response)
      expect(body.statusCode).toBe(402)
      expect(body.message).toBe('Payment failed')
      expect(body.url).toBe('/api/test')
      expect(body.error).toBe(true)
      expect(body.data).toEqual({
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

      const response = await invokeErrorHandler(wrapperError)

      expect(response.status).toBe(404)

      const body = await readJson(response)
      expect(body.statusCode).toBe(404)
      expect(body.data).toEqual({ why: 'Resource does not exist' })
    })

    it('defaults to 500 when no status on evlogError', async () => {
      const evlogError = Object.assign(new Error('Unknown error'), { name: 'EvlogError' })

      const response = await invokeErrorHandler(evlogError)

      expect(response.status).toBe(500)
    })

    it('does not expose internal context on EvlogError responses', async () => {
      const err = createError({
        message: 'Not allowed',
        status: 403,
        why: 'Insufficient role',
        internal: { userId: 'u-internal', rawPolicy: 'deny:admin' },
      })

      const response = await invokeErrorHandler(err)

      const body = await readJson(response)
      expect(body.internal).toBeUndefined()
      expect(JSON.stringify(body)).not.toContain('u-internal')
      expect(JSON.stringify(body)).not.toContain('rawPolicy')
      expect(body.data).toEqual({
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

      const response = await invokeErrorHandler(error)

      expect(response.status).toBe(400)

      const body = await readJson(response)
      expect(body.statusCode).toBe(400)
      expect(body.statusMessage).toBe('Something went wrong')
      expect(body.message).toBe('Something went wrong')
      expect(body.url).toBe('/api/test')
      expect(body.error).toBe(true)
      expect(body.data).toBeUndefined()
    })

    it('defaults to 500 for errors without status', async () => {
      const response = await invokeErrorHandler(new Error('Generic error'))
      expect(response.status).toBe(500)
    })

    it('uses "Internal Server Error" when no message', async () => {
      const response = await invokeErrorHandler(new Error(''))

      const body = await readJson(response)
      expect(body.message).toBe('Internal Server Error')
      expect(body.statusMessage).toBe('Internal Server Error')
    })

    it('sanitizes 5xx error messages in production', async () => {
      vi.stubEnv('NODE_ENV', 'production')

      const error = Object.assign(new Error('Database connection failed: password invalid'), {
        statusCode: 500,
      })

      const body = await readJson(await invokeErrorHandler(error))
      expect(body.message).toBe('Internal Server Error')
      expect(body.statusMessage).toBe('Internal Server Error')
    })

    it('preserves 4xx error messages in production', async () => {
      vi.stubEnv('NODE_ENV', 'production')

      const error = Object.assign(new Error('Invalid email format'), {
        statusCode: 400,
      })

      const body = await readJson(await invokeErrorHandler(error))
      expect(body.message).toBe('Invalid email format')
      expect(body.statusMessage).toBe('Invalid email format')
    })
  })
})
