import { bench, describe } from 'vitest'
import { createLogger, createRequestLogger, initLogger } from '../src/logger'

initLogger({
  env: { service: 'bench', environment: 'production' },
  pretty: false,
  silent: true,
  _suppressDrainWarning: true,
})

describe('createLogger', () => {
  bench('no initial context', () => {
    createLogger()
  })

  bench('with shallow context', () => {
    createLogger({ userId: '123', plan: 'pro' })
  })

  bench('with nested context', () => {
    createLogger({
      user: { id: '123', plan: 'pro', email: 'user@example.com' },
      request: { method: 'POST', path: '/api/checkout' },
    })
  })
})

describe('createRequestLogger', () => {
  bench('with method + path', () => {
    createRequestLogger({ method: 'POST', path: '/api/checkout' })
  })

  bench('with method + path + requestId', () => {
    createRequestLogger({ method: 'POST', path: '/api/checkout', requestId: 'req_abc123' })
  })
})

describe('log.set()', () => {
  bench('shallow merge (3 fields)', () => {
    const log = createLogger()
    log.set({ userId: '123', plan: 'pro', action: 'checkout' })
  })

  bench('shallow merge (10 fields)', () => {
    const log = createLogger()
    log.set({
      userId: '123',
      plan: 'pro',
      action: 'checkout',
      cartItems: 5,
      total: 9999,
      currency: 'USD',
      region: 'us-east-1',
      source: 'web',
      referrer: 'google',
      sessionId: 'sess_xyz',
    })
  })

  bench('deep nested merge', () => {
    const log = createLogger()
    log.set({
      user: { id: '123', plan: 'pro', profile: { name: 'John', settings: { theme: 'dark' } } },
      cart: { items: [{ id: 'a', qty: 1 }, { id: 'b', qty: 2 }], total: 9999 },
    })
  })

  bench('multiple sequential sets', () => {
    const log = createLogger()
    log.set({ userId: '123' })
    log.set({ plan: 'pro' })
    log.set({ cart: { items: 3, total: 9999 } })
    log.set({ checkout: { step: 'payment' } })
  })
})

describe('log.emit()', () => {
  bench('emit minimal event', () => {
    const log = createLogger()
    log.emit()
  })

  bench('emit with context', () => {
    const log = createLogger({ method: 'POST', path: '/api/checkout' })
    log.set({ userId: '123', plan: 'pro' })
    log.set({ cart: { items: 3, total: 9999 } })
    log.emit({ status: 200 })
  })

  bench('emit with error', () => {
    const log = createLogger({ method: 'POST', path: '/api/checkout' })
    log.set({ userId: '123' })
    log.error(new Error('Payment failed'))
    log.emit({ status: 500 })
  })

  bench('full lifecycle (create + set + emit)', () => {
    const log = createRequestLogger({ method: 'POST', path: '/api/checkout' })
    log.set({ user: { id: '123', plan: 'pro' } })
    log.set({ cart: { items: 3, total: 9999 } })
    log.set({ payment: { method: 'card', last4: '4242' } })
    log.emit({ status: 200 })
  })
})

describe('log.set() payload sizes', () => {
  const smallPayload = { a: 1, b: 'hello' }

  const mediumPayload: Record<string, unknown> = {}
  for (let i = 0; i < 50; i++) {
    mediumPayload[`field_${i}`] = i % 2 === 0 ? `value_${i}` : i
  }

  const largePayload: Record<string, unknown> = {}
  for (let i = 0; i < 200; i++) {
    largePayload[`field_${i}`] = { nested: { value: `data_${i}`, count: i } }
  }

  bench('small payload (2 fields)', () => {
    const log = createLogger()
    log.set(smallPayload)
    log.emit()
  })

  bench('medium payload (50 fields)', () => {
    const log = createLogger()
    log.set(mediumPayload)
    log.emit()
  })

  bench('large payload (200 nested fields)', () => {
    const log = createLogger()
    log.set(largePayload)
    log.emit()
  })
})
