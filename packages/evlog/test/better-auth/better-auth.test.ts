import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RequestLogger } from '../../src/types'
import {
  createAuthIdentifier,
  createAuthMiddleware,
  identifyUser,
  maskEmail,
} from '../../src/better-auth'

function createMockLogger(): RequestLogger & { setCalls: Array<Record<string, unknown>> } {
  const setCalls: Array<Record<string, unknown>> = []
  return {
    setCalls,
    set: vi.fn((data: Record<string, unknown>) => {
      setCalls.push(structuredClone(data))
    }),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    emit: vi.fn(() => null),
    getContext: vi.fn(() => ({})),
  }
}

function createMockSession(overrides?: {
  user?: Partial<Record<string, unknown>>
  session?: Partial<Record<string, unknown>>
}) {
  return {
    user: {
      id: 'usr_123',
      name: 'Hugo Richard',
      email: 'hugo@example.com',
      image: 'https://example.com/avatar.png',
      emailVerified: true,
      createdAt: new Date('2024-01-15T10:00:00Z'),
      ...overrides?.user,
    },
    session: {
      id: 'sess_abc',
      expiresAt: new Date('2024-01-22T10:00:00Z'),
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      createdAt: new Date('2024-01-15T10:00:00Z'),
      token: 'secret_token_value',
      userId: 'usr_123',
      ...overrides?.session,
    },
  }
}

function createMockAuth(session: ReturnType<typeof createMockSession> | null = createMockSession()) {
  return {
    api: {
      getSession: vi.fn(() => Promise.resolve(session)),
    },
  }
}

describe('maskEmail', () => {
  it('masks a standard email', () => {
    expect(maskEmail('hugo@example.com')).toBe('h***@example.com')
  })

  it('handles single-char local part', () => {
    expect(maskEmail('a@b.com')).toBe('a***@b.com')
  })

  it('handles missing @ symbol', () => {
    expect(maskEmail('noemail')).toBe('***')
  })
})

describe('identifyUser', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sets userId, user, and session on the logger', () => {
    const log = createMockLogger()
    const session = createMockSession()

    identifyUser(log, session)

    expect(log.set).toHaveBeenCalledOnce()
    const [call] = log.setCalls

    expect(call.userId).toBe('usr_123')

    const user = call.user as Record<string, unknown>
    expect(user.id).toBe('usr_123')
    expect(user.name).toBe('Hugo Richard')
    expect(user.email).toBe('hugo@example.com')
    expect(user.image).toBe('https://example.com/avatar.png')
    expect(user.emailVerified).toBe(true)
    expect(user.createdAt).toBe('2024-01-15T10:00:00.000Z')

    const sess = call.session as Record<string, unknown>
    expect(sess.id).toBe('sess_abc')
    expect(sess.expiresAt).toBe('2024-01-22T10:00:00.000Z')
    expect(sess.ipAddress).toBe('192.168.1.1')
  })

  it('returns true when user is identified', () => {
    const log = createMockLogger()
    expect(identifyUser(log, createMockSession())).toBe(true)
  })

  it('returns false when user id is missing', () => {
    const log = createMockLogger()
    const session = createMockSession({ user: { id: '' } })
    expect(identifyUser(log, session)).toBe(false)
    expect(log.set).not.toHaveBeenCalled()
  })

  it('does not include session token or userId in session data', () => {
    const log = createMockLogger()
    identifyUser(log, createMockSession())

    const sess = log.setCalls[0].session as Record<string, unknown>
    expect(sess.token).toBeUndefined()
    expect(sess.userId).toBeUndefined()
  })

  it('includes userAgent in session data', () => {
    const log = createMockLogger()
    identifyUser(log, createMockSession())

    const sess = log.setCalls[0].session as Record<string, unknown>
    expect(sess.userAgent).toBe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
  })

  it('masks email when maskEmail option is true', () => {
    const log = createMockLogger()
    identifyUser(log, createMockSession(), { maskEmail: true })

    const user = log.setCalls[0].user as Record<string, unknown>
    expect(user.email).toBe('h***@example.com')
  })

  it('excludes session when session option is false', () => {
    const log = createMockLogger()
    identifyUser(log, createMockSession(), { session: false })

    expect(log.setCalls[0].session).toBeUndefined()
    expect(log.setCalls[0].userId).toBe('usr_123')
    expect(log.setCalls[0].user).toBeDefined()
  })

  it('respects custom fields whitelist', () => {
    const log = createMockLogger()
    identifyUser(log, createMockSession(), { fields: ['id', 'name'] })

    const user = log.setCalls[0].user as Record<string, unknown>
    expect(user.id).toBe('usr_123')
    expect(user.name).toBe('Hugo Richard')
    expect(user.email).toBeUndefined()
    expect(user.image).toBeUndefined()
    expect(user.emailVerified).toBeUndefined()
  })

  it('always includes id even when fields omits it', () => {
    const log = createMockLogger()
    identifyUser(log, createMockSession(), { fields: ['name', 'email'] })

    const user = log.setCalls[0].user as Record<string, unknown>
    expect(user.id).toBe('usr_123')
    expect(user.name).toBe('Hugo Richard')
    expect(user.email).toBe('hugo@example.com')
  })

  it('handles string dates in session', () => {
    const log = createMockLogger()
    const session = createMockSession({
      session: {
        expiresAt: '2024-01-22T10:00:00Z',
        createdAt: '2024-01-15T10:00:00Z',
      },
    })

    identifyUser(log, session)

    const sess = log.setCalls[0].session as Record<string, unknown>
    expect(sess.expiresAt).toBe('2024-01-22T10:00:00Z')
  })

  it('handles missing optional user fields', () => {
    const log = createMockLogger()
    const session = createMockSession({
      user: { id: 'usr_456', name: undefined, email: undefined, image: undefined },
    })

    identifyUser(log, session)

    const user = log.setCalls[0].user as Record<string, unknown>
    expect(user.id).toBe('usr_456')
    expect(user.name).toBeUndefined()
    expect(user.email).toBeUndefined()
  })

  it('applies extend callback to add custom fields', () => {
    const log = createMockLogger()
    const session = createMockSession({
      user: { id: 'usr_123', name: 'Hugo', role: 'admin', activeOrganization: 'org_42' },
    })

    identifyUser(log, session, {
      extend: (s) => ({
        organization: (s.user as Record<string, unknown>).activeOrganization,
        role: (s.user as Record<string, unknown>).role,
      }),
    })

    const [call] = log.setCalls
    expect(call.organization).toBe('org_42')
    expect(call.role).toBe('admin')
    expect(call.userId).toBe('usr_123')
  })

  it('handles extend returning undefined', () => {
    const log = createMockLogger()
    identifyUser(log, createMockSession(), {
      extend: () => undefined,
    })

    expect(log.set).toHaveBeenCalledOnce()
    expect(log.setCalls[0].userId).toBe('usr_123')
  })
})

describe('createAuthMiddleware', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves session and identifies user', async () => {
    const log = createMockLogger()
    const auth = createMockAuth()
    const identify = createAuthMiddleware(auth)

    const result = await identify(log, new Headers({ cookie: 'session=abc' }))

    expect(result).toBe(true)
    expect(auth.api.getSession).toHaveBeenCalledOnce()
    expect(log.setCalls[0].userId).toBe('usr_123')
  })

  it('returns false when session is null', async () => {
    const log = createMockLogger()
    const auth = createMockAuth(null)
    const identify = createAuthMiddleware(auth)

    const result = await identify(log, new Headers())

    expect(result).toBe(false)
  })

  it('sets auth.resolvedIn timing on identified request', async () => {
    const log = createMockLogger()
    const auth = createMockAuth()
    const identify = createAuthMiddleware(auth)

    await identify(log, new Headers())

    const authData = log.setCalls.find(c => c.auth)?.auth as Record<string, unknown>
    expect(authData).toBeDefined()
    expect(authData.identified).toBe(true)
    expect(typeof authData.resolvedIn).toBe('number')
  })

  it('sets auth.identified false on anonymous request', async () => {
    const log = createMockLogger()
    const auth = createMockAuth(null)
    const identify = createAuthMiddleware(auth)

    await identify(log, new Headers())

    const authData = log.setCalls.find(c => c.auth)?.auth as Record<string, unknown>
    expect(authData).toBeDefined()
    expect(authData.identified).toBe(false)
  })

  it('catches errors and sets auth metadata with error flag', async () => {
    const log = createMockLogger()
    const auth = {
      api: {
        getSession: vi.fn(() => Promise.reject(new Error('DB connection failed'))),
      },
    }
    const identify = createAuthMiddleware(auth)

    const result = await identify(log, new Headers())
    expect(result).toBe(false)
    const authData = log.setCalls.find(c => c.auth)?.auth as Record<string, unknown>
    expect(authData).toBeDefined()
    expect(authData.identified).toBe(false)
    expect(authData.error).toBe(true)
    expect(typeof authData.resolvedIn).toBe('number')
  })

  it('calls onAnonymous on error path', async () => {
    const log = createMockLogger()
    const auth = {
      api: {
        getSession: vi.fn(() => Promise.reject(new Error('DB down'))),
      },
    }
    const onAnonymous = vi.fn()
    const identify = createAuthMiddleware(auth, { onAnonymous })

    await identify(log, new Headers())

    expect(onAnonymous).toHaveBeenCalledOnce()
    expect(onAnonymous).toHaveBeenCalledWith(log)
  })

  it('passes identify options through', async () => {
    const log = createMockLogger()
    const auth = createMockAuth()
    const identify = createAuthMiddleware(auth, { maskEmail: true, session: false })

    await identify(log, new Headers())

    const user = log.setCalls[0].user as Record<string, unknown>
    expect(user.email).toBe('h***@example.com')
    expect(log.setCalls[0].session).toBeUndefined()
  })

  it('skips excluded routes', async () => {
    const log = createMockLogger()
    const auth = createMockAuth()
    const identify = createAuthMiddleware(auth, {
      exclude: ['/api/auth/**', '/api/public/**'],
    })

    const result = await identify(log, new Headers(), '/api/auth/sign-in')
    expect(result).toBe(false)
    expect(auth.api.getSession).not.toHaveBeenCalled()
  })

  it('only resolves included routes', async () => {
    const log = createMockLogger()
    const auth = createMockAuth()
    const identify = createAuthMiddleware(auth, {
      exclude: [],
      include: ['/api/protected/**'],
    })

    expect(await identify(log, new Headers(), '/api/public/health')).toBe(false)
    expect(auth.api.getSession).not.toHaveBeenCalled()

    expect(await identify(log, new Headers(), '/api/protected/dashboard')).toBe(true)
    expect(auth.api.getSession).toHaveBeenCalledOnce()
  })

  it('resolves when no path is provided (backwards compat)', async () => {
    const log = createMockLogger()
    const auth = createMockAuth()
    const identify = createAuthMiddleware(auth, { exclude: ['/api/auth/**'] })

    const result = await identify(log, new Headers())
    expect(result).toBe(true)
    expect(auth.api.getSession).toHaveBeenCalled()
  })

  it('calls onIdentify hook when user is identified', async () => {
    const log = createMockLogger()
    const auth = createMockAuth()
    const onIdentify = vi.fn()
    const identify = createAuthMiddleware(auth, { onIdentify })

    await identify(log, new Headers())

    expect(onIdentify).toHaveBeenCalledOnce()
    expect(onIdentify).toHaveBeenCalledWith(log, expect.objectContaining({
      user: expect.objectContaining({ id: 'usr_123' }),
    }))
  })

  it('calls onAnonymous hook when no session', async () => {
    const log = createMockLogger()
    const auth = createMockAuth(null)
    const onAnonymous = vi.fn()
    const identify = createAuthMiddleware(auth, { onAnonymous })

    await identify(log, new Headers())

    expect(onAnonymous).toHaveBeenCalledOnce()
    expect(onAnonymous).toHaveBeenCalledWith(log)
  })

  it('does not call onAnonymous when user is identified', async () => {
    const log = createMockLogger()
    const auth = createMockAuth()
    const onAnonymous = vi.fn()
    const identify = createAuthMiddleware(auth, { onAnonymous })

    await identify(log, new Headers())

    expect(onAnonymous).not.toHaveBeenCalled()
  })
})

describe('createAuthIdentifier', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function createMockEvent(path: string, log?: RequestLogger) {
    return {
      path,
      headers: new Headers({ cookie: 'session=abc' }),
      context: { log },
    }
  }

  it('identifies user on a regular API request', async () => {
    const log = createMockLogger()
    const auth = createMockAuth()
    const hook = createAuthIdentifier(auth)

    await hook(createMockEvent('/api/users', log))

    expect(log.setCalls[0].userId).toBe('usr_123')
  })

  it('skips /api/auth/** by default', async () => {
    const log = createMockLogger()
    const auth = createMockAuth()
    const hook = createAuthIdentifier(auth)

    await hook(createMockEvent('/api/auth/sign-in/email', log))

    expect(auth.api.getSession).not.toHaveBeenCalled()
    expect(log.set).not.toHaveBeenCalled()
  })

  it('skips when no logger on context', async () => {
    const auth = createMockAuth()
    const hook = createAuthIdentifier(auth)

    await hook(createMockEvent('/api/users'))

    expect(auth.api.getSession).not.toHaveBeenCalled()
  })

  it('respects custom exclude patterns', async () => {
    const log = createMockLogger()
    const auth = createMockAuth()
    const hook = createAuthIdentifier(auth, { exclude: ['/api/public/**'] })

    await hook(createMockEvent('/api/public/health', log))
    expect(auth.api.getSession).not.toHaveBeenCalled()

    await hook(createMockEvent('/api/auth/sign-in/email', log))
    expect(auth.api.getSession).toHaveBeenCalled()
  })

  it('respects include patterns', async () => {
    const log = createMockLogger()
    const auth = createMockAuth()
    const hook = createAuthIdentifier(auth, {
      exclude: [],
      include: ['/api/protected/**'],
    })

    await hook(createMockEvent('/api/public/health', log))
    expect(auth.api.getSession).not.toHaveBeenCalled()

    await hook(createMockEvent('/api/protected/dashboard', log))
    expect(auth.api.getSession).toHaveBeenCalled()
  })

  it('catches errors silently', async () => {
    const log = createMockLogger()
    const auth = {
      api: {
        getSession: vi.fn(() => Promise.reject(new Error('DB error'))),
      },
    }
    const hook = createAuthIdentifier(auth)

    await expect(hook(createMockEvent('/api/users', log))).resolves.toBeUndefined()
  })
})
