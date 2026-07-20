import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUi } from '../src/lib/ui'
import { SCHEMA_VERSION } from '../src/core/output'

afterEach(() => {
  vi.restoreAllMocks()
  process.exitCode = undefined
})

describe('createUi', () => {
  it('writes human to stderr and json to stdout', () => {
    const err: string[] = []
    const out: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      err.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString())
      return true
    }) as typeof process.stderr.write)
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      out.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString())
      return true
    }) as typeof process.stdout.write)

    const ui = createUi()
    ui.human('hello')
    ui.json({ ok: true })

    expect(err.join('')).toContain('hello')
    expect(JSON.parse(out.join(''))).toEqual({
      schemaVersion: SCHEMA_VERSION,
      environment: expect.any(String),
      ok: true,
    })
  })

  it('done picks json vs human and sets exit code', () => {
    const err: string[] = []
    const out: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      err.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString())
      return true
    }) as typeof process.stderr.write)
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      out.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString())
      return true
    }) as typeof process.stdout.write)

    createUi().done({
      jsonMode: false,
      human: 'report',
      json: { a: 1 },
      summary: { ok: 0, warn: 0, fail: 1 },
    })
    expect(err.join('')).toContain('report')
    expect(out.join('')).toBe('')
    expect(process.exitCode).toBe(1)

    process.exitCode = undefined
    err.length = 0
    out.length = 0

    createUi({ json: true }).done({
      human: 'ignored',
      json: { a: 1 },
      summary: { ok: 1, warn: 0, fail: 0 },
    })
    expect(JSON.parse(out.join(''))).toMatchObject({ a: 1 })
    expect(err.join('')).toBe('')
    expect(process.exitCode).toBe(0)
  })
})
