import { describe, expect, it } from 'vitest'
import {
  clampLimit,
  parseOptionalString,
  parseOrder,
  parsePage,
  parseRange,
  parseRunsFilter,
  parseSort,
  rangeToCutoff,
} from '../server/utils/query-filters'

describe('parseRange', () => {
  it('accepts known ranges', () => {
    expect(parseRange('24h')).toBe('24h')
    expect(parseRange('7d')).toBe('7d')
    expect(parseRange('30d')).toBe('30d')
  })

  it('defaults to 7d for anything else', () => {
    expect(parseRange(undefined)).toBe('7d')
    expect(parseRange('1y')).toBe('7d')
    expect(parseRange(42)).toBe('7d')
  })
})

describe('rangeToCutoff', () => {
  const now = new Date('2024-06-15T12:00:00Z').getTime()

  it('maps each range to hours ago from `now`', () => {
    expect(rangeToCutoff('24h', now)).toEqual(new Date('2024-06-14T12:00:00Z'))
    expect(rangeToCutoff('7d', now)).toEqual(new Date('2024-06-08T12:00:00Z'))
    expect(rangeToCutoff('30d', now)).toEqual(new Date('2024-05-16T12:00:00Z'))
  })

  it('defaults `now` to the current time', () => {
    const before = Date.now()
    const cutoff = rangeToCutoff('24h')
    const after = Date.now()
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - 24 * 60 * 60 * 1000)
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - 24 * 60 * 60 * 1000)
  })
})

describe('parseOptionalString', () => {
  it('returns trimmed non-empty strings', () => {
    expect(parseOptionalString('  evlog-cli  ')).toBe('evlog-cli')
  })

  it('returns undefined for blank or non-string values', () => {
    expect(parseOptionalString('')).toBeUndefined()
    expect(parseOptionalString('   ')).toBeUndefined()
    expect(parseOptionalString(undefined)).toBeUndefined()
    expect(parseOptionalString(42)).toBeUndefined()
  })
})

describe('clampLimit', () => {
  it('falls back to the default for invalid input', () => {
    expect(clampLimit(undefined)).toBe(25)
    expect(clampLimit('not-a-number')).toBe(25)
    expect(clampLimit('-5')).toBe(25)
    expect(clampLimit('0')).toBe(25)
  })

  it('clamps to the max', () => {
    expect(clampLimit('500')).toBe(100)
  })

  it('floors fractional values', () => {
    expect(clampLimit('10.9')).toBe(10)
  })

  it('passes through valid values within bounds', () => {
    expect(clampLimit('50')).toBe(50)
  })
})

describe('parseSort', () => {
  it('accepts known sort keys', () => {
    for (const key of ['timestamp', 'tool', 'command', 'environment', 'outcome', 'durationMs', 'machineId']) {
      expect(parseSort(key)).toBe(key)
    }
  })

  it('defaults to timestamp for anything else', () => {
    expect(parseSort(undefined)).toBe('timestamp')
    expect(parseSort('nonsense')).toBe('timestamp')
    expect(parseSort(42)).toBe('timestamp')
  })
})

describe('parseOrder', () => {
  it('accepts asc, defaults everything else to desc', () => {
    expect(parseOrder('asc')).toBe('asc')
    expect(parseOrder('desc')).toBe('desc')
    expect(parseOrder(undefined)).toBe('desc')
    expect(parseOrder('nonsense')).toBe('desc')
  })
})

describe('parsePage', () => {
  it('parses a positive numeric string', () => {
    expect(parsePage('3')).toBe(3)
  })

  it('floors fractional values', () => {
    expect(parsePage('3.9')).toBe(3)
  })

  it('defaults to 1 for invalid or non-positive values', () => {
    expect(parsePage(undefined)).toBe(1)
    expect(parsePage('0')).toBe(1)
    expect(parsePage('-1')).toBe(1)
    expect(parsePage('abc')).toBe(1)
  })
})

describe('parseRunsFilter', () => {
  it('parses range/tool/environment from a query object', () => {
    expect(parseRunsFilter({ range: '24h', tool: 'evlog-cli', environment: 'production' })).toEqual({
      range: '24h',
      tool: 'evlog-cli',
      environment: 'production',
    })
  })

  it('defaults range and omits blank tool/environment', () => {
    expect(parseRunsFilter({})).toEqual({ range: '7d', tool: undefined, environment: undefined })
  })
})
