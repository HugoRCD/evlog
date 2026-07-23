import { afterEach, describe, expect, it } from 'vitest'
import { mockDataOverride, shouldUseMockData } from '../server/utils/mock-mode'

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
