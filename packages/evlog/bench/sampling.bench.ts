import { bench, describe } from 'vitest'
import { createLogger, initLogger, shouldKeep } from '../src/logger'

describe('head sampling', () => {
  bench('no sampling configured', () => {
    initLogger({
      pretty: false,
      silent: true,
      _suppressDrainWarning: true,
    })
    const log = createLogger({ method: 'GET', path: '/api/health' })
    log.emit({ status: 200 })
  })

  bench('with sampling rates', () => {
    initLogger({
      pretty: false,
      silent: true,
      sampling: { rates: { info: 10, warn: 50, debug: 0, error: 100 } },
      _suppressDrainWarning: true,
    })
    const log = createLogger({ method: 'GET', path: '/api/health' })
    log.emit({ status: 200 })
  })
})

describe('tail sampling (shouldKeep)', () => {
  initLogger({
    pretty: false,
    silent: true,
    sampling: {
      rates: { info: 10 },
      keep: [
        { duration: 1000 },
        { status: 400 },
        { path: '/api/critical/**' },
      ],
    },
    _suppressDrainWarning: true,
  })

  bench('no match (fast path)', () => {
    shouldKeep({ status: 200, duration: 50, path: '/api/health', method: 'GET', context: {} })
  })

  bench('status match', () => {
    shouldKeep({ status: 500, duration: 50, path: '/api/health', method: 'GET', context: {} })
  })

  bench('duration match', () => {
    shouldKeep({ status: 200, duration: 2000, path: '/api/health', method: 'GET', context: {} })
  })

  bench('path glob match', () => {
    shouldKeep({ status: 200, duration: 50, path: '/api/critical/checkout', method: 'POST', context: {} })
  })
})

describe('head + tail sampling combined', () => {
  initLogger({
    pretty: false,
    silent: true,
    sampling: {
      rates: { info: 10, warn: 50, debug: 0, error: 100 },
      keep: [
        { duration: 1000 },
        { status: 400 },
        { path: '/api/critical/**' },
      ],
    },
    _suppressDrainWarning: true,
  })

  bench('full emit with sampling (likely sampled out)', () => {
    const log = createLogger({ method: 'GET', path: '/api/health' })
    log.emit({ status: 200 })
  })

  bench('full emit with force-keep (tail sampling hit)', () => {
    const log = createLogger({ method: 'POST', path: '/api/critical/checkout' })
    log.set({ userId: '123' })
    log.emit({ status: 500 })
  })
})
