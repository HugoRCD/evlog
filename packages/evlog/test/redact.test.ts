import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { redactEvent, normalizeRedactConfig, resolveRedactConfig, builtinPatterns } from '../src/redact'
import type { RedactConfig } from '../src/types'
import { createLogger, initLogger } from '../src/logger'

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
    expect(users[0]!.email).toBe('[REDACTED]')
    expect(users[1]!.email).toBe('[REDACTED]')
    expect(users[0]!.name).toBe('Alice')
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
    const config = resolveRedactConfig(true)
    expect(config).toBeDefined()
    expect(config!._maskers).toHaveLength(Object.keys(builtinPatterns).length)
  })

  it('includes built-in maskers by default when object is passed', () => {
    const config = resolveRedactConfig({ paths: ['user.password'] })
    expect(config!.paths).toEqual(['user.password'])
    expect(config!._maskers).toHaveLength(Object.keys(builtinPatterns).length)
  })

  it('disables built-ins with builtins: false', () => {
    const config = resolveRedactConfig({ builtins: false, paths: ['user.email'] })
    expect(config!.paths).toEqual(['user.email'])
    expect(config!._maskers).toBeUndefined()
    expect(config!.patterns).toBeUndefined()
  })

  it('selects specific built-in maskers', () => {
    const config = resolveRedactConfig({ builtins: ['email', 'creditCard'] })
    expect(config!._maskers).toHaveLength(2)
  })

  it('keeps custom patterns separate from built-in maskers', () => {
    const custom = /SECRET_\w+/g
    const config = resolveRedactConfig({
      builtins: ['email'],
      patterns: [custom],
    })
    expect(config!._maskers).toHaveLength(1)
    expect(config!.patterns).toHaveLength(1)
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
    const config = normalizeRedactConfig(true)
    expect(config).toBeDefined()
    expect(config!._maskers!.length).toBe(Object.keys(builtinPatterns).length)
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
    const config = normalizeRedactConfig({
      patterns: ['\\b\\d{4}\\b'],
    })
    expect(config?._maskers).toHaveLength(Object.keys(builtinPatterns).length)
    expect(config?.patterns).toHaveLength(1)
    expect(config?.patterns![0]!.source).toBe('\\b\\d{4}\\b')
  })

  it('converts source/flags objects to RegExp', () => {
    const config = normalizeRedactConfig({
      builtins: false,
      patterns: [{ source: '\\d+', flags: 'gi' }],
    })
    expect(config?.patterns).toHaveLength(1)
    expect(config?.patterns![0]).toBeInstanceOf(RegExp)
    expect(config?.patterns![0]!.source).toBe('\\d+')
    expect(config?.patterns![0]!.flags).toBe('gi')
  })

  it('preserves existing RegExp instances', () => {
    const re = /test/g
    const config = normalizeRedactConfig({
      builtins: false,
      patterns: [re],
    })
    expect(config?.patterns![0]).toBe(re)
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

describe('initLogger + redact integration', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    initLogger()
  })

  it('redacts paths in emitted wide events', () => {
    initLogger({
      pretty: false,
      redact: {
        paths: ['user.email'],
      },
    })

    const logger = createLogger({ user: { email: 'alice@example.com', id: '123' } })
    const event = logger.emit()

    expect(event).not.toBeNull()
    const user = event!.user as Record<string, unknown>
    expect(user.email).toBe('[REDACTED]')
    expect(user.id).toBe('123')
  })

  it('redacts custom patterns with flat replacement', () => {
    initLogger({
      pretty: false,
      redact: {
        builtins: false,
        patterns: [/[\w.+-]+@[\w-]+\.[\w.]+/g],
      },
    })

    const logger = createLogger({ message: 'Contact alice@example.com' })
    const event = logger.emit()

    expect(event).not.toBeNull()
    expect(event!.message).toBe('Contact [REDACTED]')
  })

  it('redacts before console output', () => {
    const infoSpy = vi.spyOn(console, 'info')

    initLogger({
      pretty: false,
      redact: {
        paths: ['secret'],
      },
    })

    const logger = createLogger({ secret: 'super-secret-value' })
    logger.emit()

    const output = infoSpy.mock.calls[0]?.[0] as string
    expect(output).toContain('[REDACTED]')
    expect(output).not.toContain('super-secret-value')
  })

  it('redacts before drain callback', async () => {
    const drainedEvents: Record<string, unknown>[] = []

    initLogger({
      pretty: false,
      silent: true,
      redact: {
        paths: ['user.email'],
      },
      drain: (ctx) => {
        drainedEvents.push({ ...ctx.event })
      },
    })

    const logger = createLogger({
      user: { email: 'alice@example.com' },
      note: 'Card 4111 1111 1111 1111',
    })
    logger.emit()

    await new Promise(resolve => setTimeout(resolve, 10))

    expect(drainedEvents).toHaveLength(1)
    const drained = drainedEvents[0]!
    expect((drained.user as Record<string, unknown>).email).toBe('[REDACTED]')
    expect(drained.note).toBe('Card ****1111')
  })

  it('redact: true enables all built-in patterns', () => {
    initLogger({ pretty: false, redact: true })

    const logger = createLogger({
      message: 'User alice@example.com paid with 4111-1111-1111-1111 from 192.168.1.100',
    })
    const event = logger.emit()

    expect(event).not.toBeNull()
    expect(event!.message).not.toContain('alice@example.com')
    expect(event!.message).not.toContain('4111-1111-1111-1111')
    expect(event!.message).not.toContain('192.168.1.100')
  })

  it('redact: true with custom paths on top', () => {
    initLogger({
      pretty: false,
      redact: {
        paths: ['user.password'],
      },
    })

    const logger = createLogger({
      user: { password: 'secret123', email: 'alice@example.com' },
    })
    const event = logger.emit()

    expect(event).not.toBeNull()
    const user = event!.user as Record<string, unknown>
    expect(user.password).toBe('[REDACTED]')
    expect(user.email).toBe('a***@***.com')
  })

  it('redact with builtins: false only applies custom config', () => {
    initLogger({
      pretty: false,
      redact: {
        builtins: false,
        paths: ['secret'],
      },
    })

    const logger = createLogger({
      secret: 'hidden',
      email: 'alice@example.com',
    })
    const event = logger.emit()

    expect(event).not.toBeNull()
    expect(event!.secret).toBe('[REDACTED]')
    expect(event!.email).toBe('alice@example.com')
  })

  it('redact with selected builtins', () => {
    initLogger({
      pretty: false,
      redact: {
        builtins: ['email'],
      },
    })

    const logger = createLogger({
      contact: 'alice@example.com',
      card: '4111-1111-1111-1111',
    })
    const event = logger.emit()

    expect(event).not.toBeNull()
    expect(event!.contact).not.toContain('alice@example.com')
    expect(event!.card).toBe('4111-1111-1111-1111')
  })
})

describe('default redaction behavior', () => {
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    vi.restoreAllMocks()
    initLogger()
  })

  it('enables redaction by default in production', () => {
    process.env.NODE_ENV = 'production'
    initLogger({ pretty: false })

    const logger = createLogger({ email: 'alice@example.com' })
    const event = logger.emit()

    expect(event).not.toBeNull()
    expect(event!.email).toBe('a***@***.com')
  })

  it('disables redaction by default in development', () => {
    process.env.NODE_ENV = 'development'
    initLogger({ pretty: false })

    const logger = createLogger({ email: 'alice@example.com' })
    const event = logger.emit()

    expect(event).not.toBeNull()
    expect(event!.email).toBe('alice@example.com')
  })

  it('respects explicit redact: false in production', () => {
    process.env.NODE_ENV = 'production'
    initLogger({ pretty: false, redact: false })

    const logger = createLogger({ email: 'alice@example.com' })
    const event = logger.emit()

    expect(event).not.toBeNull()
    expect(event!.email).toBe('alice@example.com')
  })

  it('respects explicit redact: true in development', () => {
    process.env.NODE_ENV = 'development'
    initLogger({ pretty: false, redact: true })

    const logger = createLogger({ email: 'alice@example.com' })
    const event = logger.emit()

    expect(event).not.toBeNull()
    expect(event!.email).toBe('a***@***.com')
  })
})

describe('built-in smart masking', () => {
  it('masks credit card numbers keeping last 4 digits', () => {
    const event: Record<string, unknown> = {
      a: '4111111111111111',
      b: '4111-1111-1111-1111',
      c: '4111 1111 1111 1111',
      safe: 'no card here',
    }
    redactEvent(event, resolveRedactConfig({ builtins: ['creditCard'] })!)
    expect(event.a).toBe('****1111')
    expect(event.b).toBe('****1111')
    expect(event.c).toBe('****1111')
    expect(event.safe).toBe('no card here')
  })

  it('masks email addresses keeping first char and TLD', () => {
    const event: Record<string, unknown> = {
      a: 'alice@example.com',
      b: 'Contact bob.smith+tag@company.co.uk',
      safe: 'no email here',
    }
    redactEvent(event, resolveRedactConfig({ builtins: ['email'] })!)
    expect(event.a).toBe('a***@***.com')
    expect(event.b).toBe('Contact b***@***.uk')
    expect(event.safe).toBe('no email here')
  })

  it('masks IPv4 addresses keeping last octet', () => {
    const event: Record<string, unknown> = {
      a: '192.168.1.1',
      b: 'Client 10.0.0.5 connected',
      localhost: '127.0.0.1',
      zero: '0.0.0.0',
    }
    redactEvent(event, resolveRedactConfig({ builtins: ['ipv4'] })!)
    expect(event.a).toBe('***.***.***.1')
    expect(event.b).toBe('Client ***.***.***.5 connected')
    expect(event.localhost).toBe('127.0.0.1')
    expect(event.zero).toBe('0.0.0.0')
  })

  it('masks international phone numbers keeping last 2 digits', () => {
    const event: Record<string, unknown> = {
      us: '+1 (555) 123-4567',
      fr: '+33 6 12 34 56 78',
      uk: '+44 7911 123456',
      de: '+49 170 1234567',
      parens: '(555) 123-4567',
      safe: 'no phone here',
    }
    redactEvent(event, resolveRedactConfig({ builtins: ['phone'] })!)
    expect(event.us).toContain('****')
    expect(event.us).not.toContain('555')
    expect(event.fr).not.toContain('12 34')
    expect(event.de).not.toContain('1234567')
    expect(event.parens).not.toContain('555')
    expect(event.safe).toBe('no phone here')
  })

  it('does not mask digit-rich identifiers (UUIDs, hex hashes, ids)', () => {
    const event: Record<string, unknown> = {
      uuid: '12345642-f647-42bb-9fda-742d2b4f41fa',
      requestId: '00000000-1111-2222-3333-444444444444',
      idempotencyKey: '961da3f34097bb096902b5457ae02687',
      orderId: 'ord_1234567890',
      bareDigits: '0612345678',
      localPhone: '06 12 34 56 78',
    }
    redactEvent(event, resolveRedactConfig({ builtins: ['phone'] })!)
    expect(event.uuid).toBe('12345642-f647-42bb-9fda-742d2b4f41fa')
    expect(event.requestId).toBe('00000000-1111-2222-3333-444444444444')
    expect(event.idempotencyKey).toBe('961da3f34097bb096902b5457ae02687')
    expect(event.orderId).toBe('ord_1234567890')
    expect(event.bareDigits).toBe('0612345678')
    expect(event.localPhone).toBe('06 12 34 56 78')
  })

  it('masks JWT tokens keeping prefix', () => {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
    const event: Record<string, unknown> = {
      auth: `Token: ${token}`,
      safe: 'no jwt here',
    }
    redactEvent(event, resolveRedactConfig({ builtins: ['jwt'] })!)
    expect(event.auth).toContain('eyJ***')
    expect(event.auth).not.toContain('dozjgN')
    expect(event.safe).toBe('no jwt here')
  })

  it('masks Bearer tokens keeping prefix', () => {
    const event: Record<string, unknown> = {
      header: 'Bearer sk_live_abc123def456ghi789',
      safe: 'no bearer here',
    }
    redactEvent(event, resolveRedactConfig({ builtins: ['bearer'] })!)
    expect(event.header).toContain('Bearer')
    expect(event.header).not.toContain('sk_live')
    expect(event.safe).toBe('no bearer here')
  })

  it('masks IBAN numbers keeping country code and last 3 digits', () => {
    const event: Record<string, unknown> = {
      fr: 'FR76 3000 6000 0112 3456 7890 189',
      de: 'DE89 3704 0044 0532 0130 00',
      safe: 'no iban here',
    }
    redactEvent(event, resolveRedactConfig({ builtins: ['iban'] })!)
    expect(event.fr).toContain('FR76')
    expect(event.fr).not.toContain('3000')
    expect(event.de).toContain('DE89')
    expect(event.de).not.toContain('3704')
    expect(event.safe).toBe('no iban here')
  })
})
