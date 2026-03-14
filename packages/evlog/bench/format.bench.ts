import { bench, describe } from 'vitest'
import { createLogger, initLogger } from '../src/logger'

const baseContext = {
  method: 'POST',
  path: '/api/checkout',
  user: { id: '123', plan: 'pro', email: 'user@example.com' },
  cart: { items: 3, total: 9999, currency: 'USD' },
  payment: { method: 'card', last4: '4242' },
  requestId: 'req_abc123def456',
}

describe('JSON serialization (production mode)', () => {
  initLogger({
    env: { service: 'bench', environment: 'production' },
    pretty: false,
    silent: true,
    _suppressDrainWarning: true,
  })

  bench('emit + JSON.stringify', () => {
    const log = createLogger(baseContext)
    log.emit({ status: 200 })
  })
})

describe('pretty print (development mode)', () => {
  const noop = () => {}
  const originalLog = console.log

  initLogger({
    env: { service: 'bench', environment: 'development' },
    pretty: true,
    silent: false,
    _suppressDrainWarning: true,
  })

  bench('emit + pretty print', () => {
    console.log = noop
    const log = createLogger(baseContext)
    log.emit({ status: 200 })
    console.log = originalLog
  })
})

describe('silent mode (no output)', () => {
  initLogger({
    env: { service: 'bench', environment: 'production' },
    pretty: false,
    silent: true,
    _suppressDrainWarning: true,
  })

  bench('emit silent (event build only)', () => {
    const log = createLogger(baseContext)
    log.emit({ status: 200 })
  })
})

describe('JSON.stringify baseline', () => {
  const event = {
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'bench',
    environment: 'production',
    ...baseContext,
    status: 200,
    duration: '12ms',
  }

  bench('raw JSON.stringify (same payload)', () => {
    JSON.stringify(event)
  })
})
