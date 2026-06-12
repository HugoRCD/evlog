import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enrichErrorStackFromNextDev } from '../../src/shared/enrich-error-stack-next.node'

const require = createRequire(import.meta.url)
const hasNextInternals = (() => {
  try {
    require.resolve('next/dist/server/lib/parse-stack')
    return true
  } catch {
    return false
  }
})()

describe.skipIf(!hasNextInternals)('enrichErrorStackFromNextDev', () => {
  const originalEnv = process.env.NODE_ENV
  let dir: string

  beforeEach(() => {
    process.env.NODE_ENV = 'development'
    dir = mkdtempSync(join(tmpdir(), 'evlog-next-enrich-'))
  })

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
    rmSync(dir, { recursive: true, force: true })
  })

  /** Chunk whose sibling map sends generated 5:10 to route.ts 7:3 (`SAME` = [9, 0, 6, 2]). */
  function writeChunkFixture(): string {
    const chunk = join(dir, 'chunk.js')
    writeFileSync(chunk, 'l1\nl2\nl3\nl4\nthrow_here\n')
    writeFileSync(`${chunk}.map`, JSON.stringify({
      version: 3,
      sources: ['app/api/test/structured-error/route.ts'],
      names: [],
      mappings: ';;;;SAME',
    }))
    return chunk
  }

  it('rewrites chunk frames to original sources via sibling maps', () => {
    const chunk = writeChunkFixture()
    const error = new Error('Payment method declined')
    error.name = 'EvlogError'
    error.stack = `EvlogError: Payment method declined\n    at ${chunk}:5:10`

    enrichErrorStackFromNextDev(error)

    expect(error.stack).toContain('EvlogError: Payment method declined')
    expect(error.stack).toContain('structured-error/route.ts:7')
    expect(error.stack).not.toContain('chunk.js')
  })

  it('keeps unmapped frames when no sibling map exists', () => {
    const chunk = join(dir, 'plain.js')
    writeFileSync(chunk, 'throw_here\n')
    const error = new Error('boom')
    error.stack = `Error: boom\n    at ${chunk}:1:1`

    enrichErrorStackFromNextDev(error)

    expect(error.stack).toContain('plain.js:1')
  })

  it('does nothing in production', () => {
    process.env.NODE_ENV = 'production'
    const chunk = writeChunkFixture()
    const error = new Error('boom')
    const stack = `Error: boom\n    at ${chunk}:5:10`
    error.stack = stack

    enrichErrorStackFromNextDev(error)

    expect(error.stack).toBe(stack)
  })
})
