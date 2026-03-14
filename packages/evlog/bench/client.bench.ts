import { bench, describe } from 'vitest'
import type { DrainContext, WideEvent } from '../src/types'
import { createDrainPipeline } from '../src/pipeline'

// --- Client log serialization ---

const minimalLog = {
  timestamp: '2025-01-15T10:30:00.000Z',
  level: 'info' as const,
  service: 'client',
  tag: 'checkout',
  message: 'User clicked pay',
}

const richLog = {
  timestamp: '2025-01-15T10:30:00.000Z',
  level: 'info' as const,
  service: 'client',
  userId: 'usr_abc123',
  sessionId: 'sess_xyz789',
  tag: 'checkout',
  message: 'User clicked pay',
  cart: { items: 3, total: 9999, currency: 'USD' },
  device: { type: 'desktop', browser: 'Chrome', os: 'macOS' },
  page: { path: '/checkout', referrer: '/cart', loadTime: 1200 },
}

const batchOf10 = Array.from({ length: 10 }, (_, i) => ({
  ...richLog,
  timestamp: new Date(Date.now() + i).toISOString(),
}))

const batchOf50 = Array.from({ length: 50 }, (_, i) => ({
  ...richLog,
  timestamp: new Date(Date.now() + i).toISOString(),
}))

describe('client log serialization', () => {
  bench('JSON.stringify — minimal log', () => {
    JSON.stringify(minimalLog)
  })

  bench('JSON.stringify — rich log', () => {
    JSON.stringify(richLog)
  })

  bench('JSON.stringify — batch of 10', () => {
    JSON.stringify(batchOf10)
  })

  bench('JSON.stringify — batch of 50', () => {
    JSON.stringify(batchOf50)
  })
})

describe('client log formatting', () => {
  bench('build formatted log object (minimal)', () => {
    const _formatted = {
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'client',
      tag: 'checkout',
      message: 'User clicked pay',
    }
  })

  bench('build formatted log object (with identity spread)', () => {
    const identity = { userId: 'usr_abc', sessionId: 'sess_xyz' }
    const event = { tag: 'checkout', message: 'Clicked pay' }
    const _formatted = {
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'client',
      ...identity,
      ...event,
    }
  })

  bench('build + serialize (rich log)', () => {
    const identity = { userId: 'usr_abc', sessionId: 'sess_xyz' }
    const event = {
      tag: 'checkout',
      message: 'Clicked pay',
      cart: { items: 3, total: 9999 },
    }
    const formatted = {
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'client',
      ...identity,
      ...event,
    }
    JSON.stringify(formatted)
  })
})

// --- Drain pipeline ---

function makeDrainCtx(i = 0): DrainContext {
  return {
    event: {
      timestamp: '2025-01-15T10:30:00.000Z',
      level: 'info',
      service: 'bench',
      environment: 'production',
      method: 'POST',
      path: '/api/checkout',
      status: 200,
      duration: '12ms',
      userId: `usr_${i}`,
    } as unknown as WideEvent,
    request: { method: 'POST', path: '/api/checkout', requestId: `req_${i}` },
    headers: { 'content-type': 'application/json' },
  }
}

describe('pipeline — push throughput', () => {
  bench('push 1 event (no flush)', () => {
    const pipeline = createDrainPipeline({ batch: { size: 1000, intervalMs: 60_000 } })
    const drain = pipeline(async () => {})
    drain(makeDrainCtx())
  })

  bench('push 100 events (no flush)', () => {
    const pipeline = createDrainPipeline({ batch: { size: 1000, intervalMs: 60_000 } })
    const drain = pipeline(async () => {})
    for (let i = 0; i < 100; i++) drain(makeDrainCtx(i))
  })

  bench('push 1000 events (no flush)', () => {
    const pipeline = createDrainPipeline({ batch: { size: 2000, intervalMs: 60_000 } })
    const drain = pipeline(async () => {})
    for (let i = 0; i < 1000; i++) drain(makeDrainCtx(i))
  })
})

describe('pipeline — push + batch trigger', () => {
  bench('push 50 events (triggers 1 batch flush)', () => {
    const pipeline = createDrainPipeline({ batch: { size: 50, intervalMs: 60_000 } })
    const drain = pipeline(async () => {})
    for (let i = 0; i < 50; i++) drain(makeDrainCtx(i))
  })

  bench('push 200 events (triggers 4 batch flushes)', () => {
    const pipeline = createDrainPipeline({ batch: { size: 50, intervalMs: 60_000 } })
    const drain = pipeline(async () => {})
    for (let i = 0; i < 200; i++) drain(makeDrainCtx(i))
  })
})

describe('pipeline — buffer overflow', () => {
  bench('push 1100 events (100 dropped, buffer=1000)', () => {
    const pipeline = createDrainPipeline({
      batch: { size: 2000, intervalMs: 60_000 },
      maxBufferSize: 1000,
    })
    const drain = pipeline(async () => {})
    for (let i = 0; i < 1100; i++) drain(makeDrainCtx(i))
  })
})

describe('pipeline — serialization in drain', () => {
  bench('push 50 + JSON.stringify batch in drain', () => {
    const pipeline = createDrainPipeline<DrainContext>({ batch: { size: 50, intervalMs: 60_000 } })
    const drain = pipeline(async (batch) => {
      JSON.stringify(batch.map(ctx => ctx.event))
    })
    for (let i = 0; i < 50; i++) drain(makeDrainCtx(i))
  })
})
