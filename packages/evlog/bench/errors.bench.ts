import { bench, describe } from 'vitest'
import { createError, EvlogError } from '../src/error'
import { parseError } from '../src/runtime/utils/parseError'

describe('createError', () => {
  bench('string message', () => {
    createError('Something went wrong')
  })

  bench('with status', () => {
    createError({ message: 'Payment failed', status: 402 })
  })

  bench('full options', () => {
    createError({
      message: 'Payment failed',
      status: 402,
      why: 'Card declined by issuer',
      fix: 'Try a different payment method',
      link: 'https://docs.example.com/payments/declined',
    })
  })

  bench('with cause', () => {
    createError({
      message: 'Payment failed',
      status: 502,
      why: 'Upstream timeout',
      cause: new Error('ECONNREFUSED'),
    })
  })
})

describe('parseError', () => {
  const evlogErr = createError({
    message: 'Payment failed',
    status: 402,
    why: 'Card declined',
    fix: 'Try another card',
    link: 'https://docs.example.com',
  })

  const plainErr = new Error('Something broke')

  const fetchLikeErr = {
    data: {
      statusCode: 402,
      statusMessage: 'Payment Required',
      message: 'Payment failed',
      data: { why: 'Card declined', fix: 'Try another card' },
    },
    message: 'Payment failed',
    statusCode: 402,
  }

  bench('parse EvlogError', () => {
    parseError(evlogErr)
  })

  bench('parse plain Error', () => {
    parseError(plainErr)
  })

  bench('parse fetch-like error', () => {
    parseError(fetchLikeErr)
  })

  bench('parse string', () => {
    parseError('Unknown error')
  })
})

describe('createError + parseError round-trip', () => {
  bench('create + parse (simple)', () => {
    const err = createError('Something went wrong')
    parseError(err)
  })

  bench('create + parse (full)', () => {
    const err = createError({
      message: 'Payment failed',
      status: 402,
      why: 'Card declined by issuer',
      fix: 'Try a different payment method',
      link: 'https://docs.example.com/payments/declined',
      cause: new Error('ECONNREFUSED'),
    })
    parseError(err)
  })
})

describe('EvlogError serialization', () => {
  const err = createError({
    message: 'Payment failed',
    status: 402,
    why: 'Card declined',
    fix: 'Try another card',
    link: 'https://docs.example.com',
    cause: new Error('ECONNREFUSED'),
  })

  bench('toJSON()', () => {
    err.toJSON()
  })

  bench('toString()', () => {
    err.toString()
  })

  bench('JSON.stringify()', () => {
    JSON.stringify(err)
  })
})
