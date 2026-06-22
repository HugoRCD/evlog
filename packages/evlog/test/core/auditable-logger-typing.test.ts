import { describe, expectTypeOf, it } from 'vitest'
import type { AuditableLogger } from '../../src/audit'
import type { EvlogVariables } from '../../src/hono'
import { useLogger as useExpressLogger } from '../../src/express'
import { useLogger as useNextLogger } from '../../src/next/storage'
import type { EvlogOrpcContext } from '../../src/orpc'
import { createRequestLogger } from '../../src/logger'

describe('AuditableLogger framework typing (#389)', () => {
  it('types Hono context log with required audit', () => {
    type HonoLog = EvlogVariables['Variables']['log']
    expectTypeOf<HonoLog>().toEqualTypeOf<AuditableLogger>()
  })

  it('types oRPC context log with required audit', () => {
    type OrpcLog = EvlogOrpcContext['log']
    expectTypeOf<OrpcLog>().toEqualTypeOf<AuditableLogger>()
  })

  it('types useLogger() return values with required audit', () => {
    expectTypeOf(useExpressLogger).returns.toEqualTypeOf<AuditableLogger>()
    expectTypeOf(useNextLogger).returns.toEqualTypeOf<AuditableLogger>()
  })

  it('createRequestLogger matches AuditableLogger and audit is callable', () => {
    const log = createRequestLogger({ method: 'GET', path: '/api/users' })
    expectTypeOf(log).toEqualTypeOf<AuditableLogger>()
    log.audit({
      action: 'users.list',
      actor: { type: 'user', id: 'u1' },
      outcome: 'success',
    })
    log.audit.deny('Insufficient permissions', {
      action: 'users.list',
      actor: { type: 'user', id: 'u1' },
    })
  })
})
