import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { redactEvent, normalizeRedactConfig, resolveRedactConfig, builtinPatterns } from '../../src/redact'
import type { RedactConfig } from '../../src/types'
import { createLogger, initLogger } from '../../src/logger'
import { defined } from '../helpers/defined'

describe('redactEvent - path-based', () => {
  it('redacts a top-level field', () => {
    const event: Record<string, unknown> = { email: 'alice@example.com', name: 'Alice' }
    redactEvent(event, { paths: ['email'] })
    expect(event.email).toBe('[REDACTED]')
    expect(event.name).toBe('Alice')
  })

  it('redacts a nested field', () => {
    const event: Record<string, unknown> = {
      user: { id: '123', email: 'alice@example.com', plan: 'pro' },
    }
    redactEvent(event, { paths: ['user.email'] })
    const user = event.user as Record<string, unknown>
    expect(user.email).toBe('[REDACTED]')
    expect(user.id).toBe('123')
    expect(user.plan).toBe('pro')
  })

  it('redacts deeply nested fields', () => {
    const event: Record<string, unknown> = {
      payment: { card: { number: '4111111111111111', expiry: '12/26' } },
    }
    redactEvent(event, { paths: ['payment.card.number'] })
    const card = (event.payment as Record<string, unknown>).card as Record<string, unknown>
    expect(card.number).toBe('[REDACTED]')
    expect(card.expiry).toBe('12/26')
  })

  it('silently skips missing paths', () => {
    const event: Record<string, unknown> = { name: 'Alice' }
    redactEvent(event, { paths: ['user.email', 'nonexistent'] })
    expect(event.name).toBe('Alice')
    expect(event).not.toHaveProperty('user')
  })

  it('redacts multiple paths', () => {
    const event: Record<string, unknown> = {
      user: { email: 'alice@example.com', ip: '192.168.1.1' },
      token: 'secret-jwt-token',
    }
    redactEvent(event, { paths: ['user.email', 'user.ip', 'token'] })
    const user = event.user as Record<string, unknown>
    expect(user.email).toBe('[REDACTED]')
    expect(user.ip).toBe('[REDACTED]')
    expect(event.token).toBe('[REDACTED]')
  })

  it('uses custom replacement string', () => {
    const event: Record<string, unknown> = { user: { email: 'alice@example.com' } }
    redactEvent(event, { paths: ['user.email'], replacement: '***' })
    expect((event.user as Record<string, unknown>).email).toBe('***')
  })

  it('redacts non-string values at path', () => {
    const event: Record<string, unknown> = {
      user: { age: 25, settings: { notifications: true } },
    }
    redactEvent(event, { paths: ['user.age', 'user.settings'] })
    const user = event.user as Record<string, unknown>
    expect(user.age).toBe('[REDACTED]')
    expect(user.settings).toBe('[REDACTED]')
  })
})

describe('redactEvent - pattern-based', () => {
  it('redacts credit card numbers', () => {
    const ccPattern = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g
    const event: Record<string, unknown> = {
      message: 'Card 4111 1111 1111 1111 was declined',
      other: 'no card here',
    }
    redactEvent(event, { patterns: [ccPattern] })
    expect(event.message).toBe('Card [REDACTED] was declined')
    expect(event.other).toBe('no card here')
  })

  it('redacts email addresses', () => {
    const emailPattern = /[\w.+-]+@[\w-]+\.[\w.]+/g
    const event: Record<string, unknown> = {
      user: { note: 'Contact alice@example.com for details' },
    }
    redactEvent(event, { patterns: [emailPattern] })
    expect((event.user as Record<string, unknown>).note).toBe('Contact [REDACTED] for details')
  })

  it('redacts IP addresses', () => {
    const ipPattern = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g
    const event: Record<string, unknown> = {
      client: { ip: '192.168.1.1' },
      log: 'Connection from 10.0.0.5 established',
    }
    redactEvent(event, { patterns: [ipPattern] })
    expect((event.client as Record<string, unknown>).ip).toBe('[REDACTED]')
    expect(event.log).toBe('Connection from [REDACTED] established')
  })

  it('applies multiple patterns', () => {
    const emailPattern = /[\w.+-]+@[\w-]+\.[\w.]+/g
    const ipPattern = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g
    const event: Record<string, unknown> = {
      message: 'User alice@example.com connected from 10.0.0.1',
    }
    redactEvent(event, { patterns: [emailPattern, ipPattern] })
    expect(event.message).toBe('User [REDACTED] connected from [REDACTED]')
  })

  it('handles arrays with string values', () => {
    const emailPattern = /[\w.+-]+@[\w-]+\.[\w.]+/g
    const event: Record<string, unknown> = {
      recipients: ['alice@example.com', 'bob@example.com', 'not-an-email'],
    }
    redactEvent(event, { patterns: [emailPattern] })
    const recipients = event.recipients as string[]
    expect(recipients[0]).toBe('[REDACTED]')
    expect(recipients[1]).toBe('[REDACTED]')
    expect(recipients[2]).toBe('not-an-email')
  })

  it('handles arrays with nested objects', () => {
    const emailPattern = /[\w.+-]+@[\w-]+\.[\w.]+/g
    const event: Record<string, unknown> = {
      users: [
        { name: 'Alice', email: 'alice@test.com' },
        { name: 'Bob', email: 'bob@test.com' },
      ],
    }
    redactEvent(event, { patterns: [emailPattern] })
    const users = event.users as Record<string, unknown>[]
    expect(defined(users[0], 'users[0]').email).toBe('[REDACTED]')
    expect(defined(users[1], 'users[1]').email).toBe('[REDACTED]')
    expect(defined(users[0], 'users[0]').name).toBe('Alice')
  })

  it('uses custom replacement string', () => {
    const event: Record<string, unknown> = {
      message: 'User alice@example.com logged in',
    }
    redactEvent(event, {
      patterns: [/[\w.+-]+@[\w-]+\.[\w.]+/g],
      replacement: '***',
    })
    expect(event.message).toBe('User *** logged in')
  })

  it('skips non-string non-object values', () => {
    const event: Record<string, unknown> = {
      count: 42,
      active: true,
      name: null,
    }
    redactEvent(event, { patterns: [/test/g] })
    expect(event.count).toBe(42)
    expect(event.active).toBe(true)
    expect(event.name).toBeNull()
  })
})

describe('redactEvent - combined paths + patterns', () => {
  it('applies both path and pattern redaction', () => {
    const event: Record<string, unknown> = {
      user: {
        email: 'alice@example.com',
        ip: '192.168.1.1',
      },
      message: 'Payment with card 4111-1111-1111-1111 processed',
    }
    redactEvent(event, {
      paths: ['user.email', 'user.ip'],
      patterns: [/\b\d{4}[-]?\d{4}[-]?\d{4}[-]?\d{4}\b/g],
    })
    const user = event.user as Record<string, unknown>
    expect(user.email).toBe('[REDACTED]')
    expect(user.ip).toBe('[REDACTED]')
    expect(event.message).toBe('Payment with card [REDACTED] processed')
  })
})

describe('redactEvent - edge cases', () => {
  it('handles empty config gracefully', () => {
    const event: Record<string, unknown> = { user: { email: 'alice@example.com' } }
    redactEvent(event, {})
    expect((event.user as Record<string, unknown>).email).toBe('alice@example.com')
  })

  it('handles empty paths array', () => {
    const event: Record<string, unknown> = { secret: 'value' }
    redactEvent(event, { paths: [] })
    expect(event.secret).toBe('value')
  })

  it('handles empty patterns array', () => {
    const event: Record<string, unknown> = { secret: 'value' }
    redactEvent(event, { patterns: [] })
    expect(event.secret).toBe('value')
  })

  it('handles null/undefined values in the tree', () => {
    const event: Record<string, unknown> = {
      user: null,
      data: undefined,
      valid: 'test@example.com',
    }
    redactEvent(event, {
      paths: ['user.email'],
      patterns: [/[\w.+-]+@[\w-]+\.[\w.]+/g],
    })
    expect(event.user).toBeNull()
    expect(event.data).toBeUndefined()
    expect(event.valid).toBe('[REDACTED]')
  })
})

describe('resolveRedactConfig', () => {
  it('returns undefined for false', () => {
    expect(resolveRedactConfig(false)).toBeUndefined()
  })

  it('returns undefined for undefined', () => {
    expect(resolveRedactConfig(undefined)).toBeUndefined()
  })

  it('returns all built-in maskers for true', () => {
    const config = defined(resolveRedactConfig(true), 'redact config')
    expect(config._maskers).toHaveLength(Object.keys(builtinPatterns).length)
  })

  it('includes built-in maskers by default when object is passed', () => {
    const config = defined(resolveRedactConfig({ paths: ['user.password'] }), 'redact config')
    expect(config.paths).toEqual(['user.password'])
    expect(config._maskers).toHaveLength(Object.keys(builtinPatterns).length)
  })

  it('disables built-ins with builtins: false', () => {
    const config = defined(resolveRedactConfig({ builtins: false, paths: ['user.email'] }), 'redact config')
    expect(config.paths).toEqual(['user.email'])
    expect(config._maskers).toBeUndefined()
    expect(config.patterns).toBeUndefined()
  })

  it('selects specific built-in maskers', () => {
    const config = defined(resolveRedactConfig({ builtins: ['email', 'creditCard'] }), 'redact config')
    expect(config._maskers).toHaveLength(2)
  })

  it('keeps custom patterns separate from built-in maskers', () => {
    const custom = /SECRET_\w+/g
    const config = defined(resolveRedactConfig({
      builtins: ['email'],
      patterns: [custom],
    }), 'redact config')
    expect(config._maskers).toHaveLength(1)
    expect(config.patterns).toHaveLength(1)
  })
})

describe('normalizeRedactConfig', () => {
  it('returns undefined for undefined input', () => {
    expect(normalizeRedactConfig(undefined)).toBeUndefined()
  })

  it('returns undefined for false', () => {
    expect(normalizeRedactConfig(false)).toBeUndefined()
  })

  it('resolves true to all built-in maskers', () => {
    const config = defined(normalizeRedactConfig(true), 'redact config')
    expect(defined(config._maskers, 'maskers').length).toBe(Object.keys(builtinPatterns).length)
  })

  it('preserves paths and replacement', () => {
    const config = normalizeRedactConfig({
      paths: ['user.email'],
      replacement: '***',
    })
    expect(config?.paths).toEqual(['user.email'])
    expect(config?.replacement).toBe('***')
  })

  it('converts string patterns to RegExp separately from built-in maskers', () => {
    const config = defined(normalizeRedactConfig({
      patterns: ['\\b\\d{4}\\b'],
    }), 'redact config')
    expect(config._maskers).toHaveLength(Object.keys(builtinPatterns).length)
    expect(config.patterns).toHaveLength(1)
    expect(defined(config.patterns?.[0], 'patterns[0]').source).toBe('\\b\\d{4}\\b')
  })

  it('converts source/flags objects to RegExp', () => {
    const config = defined(normalizeRedactConfig({
      builtins: false,
      patterns: [{ source: '\\d+', flags: 'gi' }],
    }), 'redact config')
    const pattern = defined(config.patterns?.[0], 'patterns[0]')
    expect(pattern).toBeInstanceOf(RegExp)
    expect(pattern.source).toBe('\\d+')
    expect(pattern.flags).toBe('gi')
  })

  it('preserves existing RegExp instances', () => {
    const re = /test/g
    const config = defined(normalizeRedactConfig({
      builtins: false,
      patterns: [re],
    }), 'redact config')
    expect(defined(config.patterns?.[0], 'patterns[0]')).toBe(re)
  })

  it('filters out invalid pattern entries', () => {
    const config = normalizeRedactConfig({
      builtins: false,
      patterns: ['valid', 42, null, undefined],
    })
    expect(config?.patterns).toHaveLength(1)
  })

  it('handles builtins field from deserialized JSON', () => {
    const config = normalizeRedactConfig({
      builtins: ['email', 'creditCard'],
      paths: ['user.ssn'],
    })
    expect(config?._maskers).toHaveLength(2)
    expect(config?.paths).toEqual(['user.ssn'])
  })
})

