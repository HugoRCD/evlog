import { describe, expect, it } from 'vitest'
import { createError, createEvlogError, EvlogError } from '../src/error'

describe('EvlogError', () => {
  it('creates error with message only', () => {
    const error = new EvlogError('Something went wrong')

    expect(error.message).toBe('Something went wrong')
    expect(error.name).toBe('EvlogError')
    expect(error.status).toBe(500)
    expect(error.why).toBeUndefined()
    expect(error.fix).toBeUndefined()
    expect(error.link).toBeUndefined()
  })

  it('creates error with full options', () => {
    const error = new EvlogError({
      message: 'Payment failed',
      status: 402,
      why: 'Card declined by issuer',
      fix: 'Try a different payment method',
      link: 'https://docs.example.com/payments',
    })

    expect(error.message).toBe('Payment failed')
    expect(error.status).toBe(402)
    expect(error.why).toBe('Card declined by issuer')
    expect(error.fix).toBe('Try a different payment method')
    expect(error.link).toBe('https://docs.example.com/payments')
  })

  it('defaults to 500 status', () => {
    const error = new EvlogError({ message: 'Server error' })

    expect(error.status).toBe(500)
  })

  describe('HTTP compatibility', () => {
    it('provides status properties for Nitro v3+ / H3 v2+', () => {
      const error = new EvlogError({ message: 'Not found', status: 404 })

      expect(error.status).toBe(404)
      expect(error.statusText).toBe('Not found')
    })

    it('provides statusCode/statusMessage for Nitro v2 / H3 v1', () => {
      const error = new EvlogError({ message: 'Not found', status: 404 })

      expect(error.statusCode).toBe(404)
      expect(error.statusMessage).toBe('Not found')
      expect(error.statusCode).toBe(error.status)
    })

    it('provides data getter with structured info', () => {
      const error = new EvlogError({
        message: 'Payment failed',
        status: 402,
        why: 'Card declined',
        fix: 'Use another card',
        link: 'https://example.com',
      })

      expect(error.data).toEqual({
        why: 'Card declined',
        fix: 'Use another card',
        link: 'https://example.com',
      })
    })

    it('returns undefined data when no extra fields', () => {
      const error = new EvlogError('Simple error')

      expect(error.data).toBeUndefined()
    })
  })

  it('preserves cause error', () => {
    const cause = new Error('Original error')
    const error = new EvlogError({
      message: 'Wrapped error',
      cause,
    })

    expect(error.cause).toBe(cause)
  })

  it('extends Error', () => {
    const error = new EvlogError('Test')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(EvlogError)
  })

  it('has stack trace', () => {
    const error = new EvlogError('Test')
    expect(error.stack).toBeDefined()
    expect(error.stack).toContain('EvlogError')
  })

  describe('toString()', () => {
    it('formats error with all fields', () => {
      const error = new EvlogError({
        message: 'Payment failed',
        why: 'Card declined',
        fix: 'Use another card',
        link: 'https://example.com',
        cause: new Error('Network error'),
      })

      const str = error.toString()
      expect(str).toContain('Payment failed')
      expect(str).toContain('Card declined')
      expect(str).toContain('Use another card')
      expect(str).toContain('https://example.com')
      expect(str).toContain('Network error')
    })

    it('formats error with message only', () => {
      const error = new EvlogError('Simple error')
      const str = error.toString()
      expect(str).toContain('Simple error')
    })
  })

  describe('toJSON()', () => {
    it('serializes error to plain object', () => {
      const cause = new Error('Original')
      const error = new EvlogError({
        message: 'Test error',
        status: 400,
        why: 'Because',
        fix: 'Do this',
        link: 'https://example.com',
        cause,
      })

      const json = error.toJSON()

      expect(json.name).toBe('EvlogError')
      expect(json.message).toBe('Test error')
      // Nitro v3+ / H3 v2+
      expect(json.status).toBe(400)
      expect(json.statusText).toBe('Test error')
      // Nitro v2 / H3 v1
      expect(json.statusCode).toBe(400)
      expect(json.statusMessage).toBe('Test error')
      // Structured data
      expect(json.data).toEqual({
        why: 'Because',
        fix: 'Do this',
        link: 'https://example.com',
      })
      expect(json.cause).toEqual({ name: 'Error', message: 'Original' })
    })

    it('handles missing cause', () => {
      const error = new EvlogError('No cause')
      const json = error.toJSON()
      expect(json.cause).toBeUndefined()
    })
  })
})

describe('createError', () => {
  it('creates EvlogError with string', () => {
    const error = createError('Quick error')
    expect(error).toBeInstanceOf(EvlogError)
    expect(error.message).toBe('Quick error')
    expect(error.status).toBe(500)
  })

  it('creates EvlogError with options', () => {
    const error = createError({
      message: 'Detailed error',
      status: 422,
      why: 'Reason',
      fix: 'Solution',
    })

    expect(error).toBeInstanceOf(EvlogError)
    expect(error.message).toBe('Detailed error')
    expect(error.status).toBe(422)
    expect(error.why).toBe('Reason')
    expect(error.fix).toBe('Solution')
  })
})

describe('createEvlogError', () => {
  it('is an alias for createError', () => {
    expect(createEvlogError).toBe(createError)
  })

  it('creates EvlogError', () => {
    const error = createEvlogError({
      message: 'Alias test',
      status: 401,
    })

    expect(error).toBeInstanceOf(EvlogError)
    expect(error.status).toBe(401)
  })
})
