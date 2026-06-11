import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enrichErrorStackFromNextDev } from '../../src/shared/enrich-error-stack-next.node'

describe('enrichErrorStackFromNextDev', () => {
  const originalEnv = process.env.NODE_ENV
  const originalDistDir = process.env.__NEXT_DIST_DIR

  beforeEach(() => {
    process.env.NODE_ENV = 'development'
  })

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
    if (originalDistDir === undefined) {
      delete process.env.__NEXT_DIST_DIR
    } else {
      process.env.__NEXT_DIST_DIR = originalDistDir
    }
  })

  it('uses the next-playground turbopack map when present', () => {
    const chunk = resolve(
      process.cwd(),
      '../../apps/next-playground/.next/dev/server/chunks/[root-of-the-server]__0pdvr0y._.js',
    )
    if (!existsSync(`${chunk}.map`)) {
      return
    }

    const error = new Error('Payment method declined')
    error.name = 'EvlogError'
    error.stack = `EvlogError: Payment method declined
    at ${chunk}:5372:176`

    enrichErrorStackFromNextDev(error)

    expect(error.stack).toContain('structured-error/route.ts:7')
  })
})
