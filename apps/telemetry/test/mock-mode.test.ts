import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockDataOverride, resetMockDataCache, shouldUseMockData } from '../server/utils/mock-mode'

/** `hasAnyRuns`/`log` reach the module as Nuxt auto-imports — free identifiers resolved off `globalThis`. */
const globals = globalThis as Record<string, unknown>

afterEach(() => {
  delete process.env.ANALYTICS_MOCK_DATA
})

describe('mockDataOverride', () => {
  it('is undefined when ANALYTICS_MOCK_DATA is unset', () => {
    expect(mockDataOverride()).toBeUndefined()
  })

  it('is true for "1" or "true"', () => {
    process.env.ANALYTICS_MOCK_DATA = '1'
    expect(mockDataOverride()).toBe(true)
    process.env.ANALYTICS_MOCK_DATA = 'true'
    expect(mockDataOverride()).toBe(true)
  })

  it('is false for "0" or "false"', () => {
    process.env.ANALYTICS_MOCK_DATA = '0'
    expect(mockDataOverride()).toBe(false)
    process.env.ANALYTICS_MOCK_DATA = 'false'
    expect(mockDataOverride()).toBe(false)
  })

  it('is undefined for anything else', () => {
    process.env.ANALYTICS_MOCK_DATA = 'yes-please'
    expect(mockDataOverride()).toBeUndefined()
  })
})

describe('shouldUseMockData', () => {
  it('resolves the explicit override without touching the database', async () => {
    // `db`/`schema` (NuxtHub auto-imports) don't exist in this plain-node test
    // environment — if the override path fell through to a DB query, it
    // would throw a ReferenceError, get caught, and resolve `true` instead.
    // Getting back `false` here proves the override short-circuited.
    process.env.ANALYTICS_MOCK_DATA = '0'
    await expect(shouldUseMockData()).resolves.toBe(false)

    process.env.ANALYTICS_MOCK_DATA = '1'
    await expect(shouldUseMockData()).resolves.toBe(true)
  })
})

describe('shouldUseMockData caching', () => {
  let calls: number
  let tableHasRows: boolean

  beforeEach(() => {
    resetMockDataCache()
    vi.useFakeTimers()
    calls = 0
    tableHasRows = false
    globals.hasAnyRuns = () => {
      calls++
      return Promise.resolve(tableHasRows)
    }
    globals.log = { warn: () => {} }
  })

  afterEach(() => {
    vi.useRealTimers()
    resetMockDataCache()
    delete globals.hasAnyRuns
    delete globals.log
  })

  it('stops querying once real runs exist — the table never goes back to empty', async () => {
    tableHasRows = true
    await expect(shouldUseMockData()).resolves.toBe(false)

    vi.advanceTimersByTime(10 * 60 * 1000)
    await expect(shouldUseMockData()).resolves.toBe(false)
    await expect(shouldUseMockData()).resolves.toBe(false)

    expect(calls).toBe(1)
  })

  it('re-checks an empty table on a short TTL so the first ingest flips it quickly', async () => {
    await expect(shouldUseMockData()).resolves.toBe(true)
    await expect(shouldUseMockData()).resolves.toBe(true)
    expect(calls).toBe(1)

    vi.advanceTimersByTime(11_000)
    tableHasRows = true
    await expect(shouldUseMockData()).resolves.toBe(false)
    expect(calls).toBe(2)
  })

  it('de-dupes the check across the concurrent requests of one poll cycle', async () => {
    const results = await Promise.all([shouldUseMockData(), shouldUseMockData(), shouldUseMockData()])

    expect(results).toEqual([true, true, true])
    expect(calls).toBe(1)
  })

  it('falls back to mock data when the check throws, and retries after the TTL', async () => {
    globals.hasAnyRuns = () => {
      calls++
      return Promise.reject(new Error('database unavailable'))
    }
    await expect(shouldUseMockData()).resolves.toBe(true)
    await expect(shouldUseMockData()).resolves.toBe(true)
    expect(calls).toBe(1)

    vi.advanceTimersByTime(11_000)
    await expect(shouldUseMockData()).resolves.toBe(true)
    expect(calls).toBe(2)
  })
})
