import { describe, expect, it } from 'vitest'
import { defineError, EvlogError } from '../src/error'

describe('EvlogError', () => {
  it('creates error with message only', () => {
    const error = new EvlogError('Something went wrong')

    expect(error.message).toBe('Something went wrong')
    expect(error.name).toBe('EvlogError')
    expect(error.why).toBeUndefined()
    expect(error.fix).toBeUndefined()
    expect(error.link).toBeUndefined()
  })

  it('creates error with full options', () => {
    const error = new EvlogError({
      message: 'Payment failed',
      why: 'Card declined by issuer',
      fix: 'Try a different payment method',
      link: 'https://docs.example.com/payments',
    })

    expect(error.message).toBe('Payment failed')
    expect(error.why).toBe('Card declined by issuer')
    expect(error.fix).toBe('Try a different payment method')
    expect(error.link).toBe('https://docs.example.com/payments')
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
        why: 'Because',
        fix: 'Do this',
        link: 'https://example.com',
        cause,
      })

      const json = error.toJSON()

      expect(json.name).toBe('EvlogError')
      expect(json.message).toBe('Test error')
      expect(json.why).toBe('Because')
      expect(json.fix).toBe('Do this')
      expect(json.link).toBe('https://example.com')
      expect(json.cause).toEqual({ name: 'Error', message: 'Original' })
      expect(json.stack).toBeDefined()
    })

    it('handles missing cause', () => {
      const error = new EvlogError('No cause')
      const json = error.toJSON()
      expect(json.cause).toBeUndefined()
    })
  })
})

describe('defineError', () => {
  it('creates EvlogError with string', () => {
    const error = defineError('Quick error')
    expect(error).toBeInstanceOf(EvlogError)
    expect(error.message).toBe('Quick error')
  })

  it('creates EvlogError with options', () => {
    const error = defineError({
      message: 'Detailed error',
      why: 'Reason',
      fix: 'Solution',
    })

    expect(error).toBeInstanceOf(EvlogError)
    expect(error.message).toBe('Detailed error')
    expect(error.why).toBe('Reason')
    expect(error.fix).toBe('Solution')
  })
})
