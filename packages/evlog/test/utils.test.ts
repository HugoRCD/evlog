import { describe, expect, it, vi } from 'vitest'
import { colors, formatDuration, getLevelColor, isClient, isDev, isServer } from '../src/utils'

describe('formatDuration', () => {
  it('formats milliseconds for duration < 1s', () => {
    expect(formatDuration(0)).toBe('0ms')
    expect(formatDuration(42)).toBe('42ms')
    expect(formatDuration(999)).toBe('999ms')
  })

  it('formats seconds for duration >= 1s', () => {
    expect(formatDuration(1000)).toBe('1.00s')
    expect(formatDuration(1500)).toBe('1.50s')
    expect(formatDuration(2345)).toBe('2.35s')
  })

  it('rounds milliseconds', () => {
    expect(formatDuration(42.7)).toBe('43ms')
    expect(formatDuration(42.3)).toBe('42ms')
  })
})

describe('isServer', () => {
  it('returns true in Node.js environment', () => {
    expect(isServer()).toBe(true)
  })
})

describe('isClient', () => {
  it('returns false in Node.js environment', () => {
    expect(isClient()).toBe(false)
  })
})

describe('isDev', () => {
  it('returns true when NODE_ENV is not production', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    expect(isDev()).toBe(true)
    process.env.NODE_ENV = originalEnv
  })

  it('returns false when NODE_ENV is production', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    expect(isDev()).toBe(false)
    process.env.NODE_ENV = originalEnv
  })

  it('returns true when NODE_ENV is test', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'
    expect(isDev()).toBe(true)
    process.env.NODE_ENV = originalEnv
  })
})

describe('getLevelColor', () => {
  it('returns red for error', () => {
    expect(getLevelColor('error')).toBe(colors.red)
  })

  it('returns yellow for warn', () => {
    expect(getLevelColor('warn')).toBe(colors.yellow)
  })

  it('returns cyan for info', () => {
    expect(getLevelColor('info')).toBe(colors.cyan)
  })

  it('returns gray for debug', () => {
    expect(getLevelColor('debug')).toBe(colors.gray)
  })

  it('returns white for unknown level', () => {
    expect(getLevelColor('unknown')).toBe(colors.white)
  })
})

describe('colors', () => {
  it('has all required color codes', () => {
    expect(colors.reset).toBe('\x1B[0m')
    expect(colors.bold).toBe('\x1B[1m')
    expect(colors.dim).toBe('\x1B[2m')
    expect(colors.red).toBe('\x1B[31m')
    expect(colors.green).toBe('\x1B[32m')
    expect(colors.yellow).toBe('\x1B[33m')
    expect(colors.blue).toBe('\x1B[34m')
    expect(colors.cyan).toBe('\x1B[36m')
    expect(colors.gray).toBe('\x1B[90m')
  })
})
