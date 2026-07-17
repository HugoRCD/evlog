import { describe, expect, it } from 'vitest'
import {
  EXIT_FAIL,
  EXIT_OK,
  createStyle,
  exitCodeFor,
  formatChecks,
  formatHeader,
  formatSummary,
  summarize,
} from '../src/core/output'
import { createContext } from '../src/core/context'
import type { Check } from '../src/core/output'

const plain = createContext({ cwd: '/tmp', env: {}, nodeVersion: 'v22.0.0', tty: false, color: false, columns: 80 })
const colored = { ...plain, color: true }

const checks: Check[] = [
  { id: 'node', status: 'ok', message: 'Node v22.0.0' },
  { id: 'evlog', status: 'warn', message: 'evlog is not a dependency', hint: 'pnpm add evlog' },
  { id: 'logs', status: 'fail', message: 'sink unreadable', hint: 'check permissions' },
]

describe('createStyle', () => {
  it('passes text through untouched without color', () => {
    const { paint, link } = createStyle(plain)
    expect(paint('cyan', 'hello')).toBe('hello')
    expect(link('https://evlog.dev', 'evlog.dev')).toBe('evlog.dev (https://evlog.dev)')
  })

  it('emits ANSI sequences and OSC 8 links with color', () => {
    const { paint, link } = createStyle(colored)
    expect(paint('bold', 'evlog')).toBe('\x1B[1mevlog\x1B[0m')
    expect(paint(['cyan', 'bold'], 'x')).toBe('\x1B[36m\x1B[1mx\x1B[0m')
    expect(link('https://evlog.dev', 'evlog.dev')).toContain('\x1B]8;;https://evlog.dev\x07')
  })
})

describe('summarize / exitCodeFor', () => {
  it('counts statuses and maps them to exit codes', () => {
    const summary = summarize(checks)
    expect(summary).toEqual({ ok: 1, warn: 1, fail: 1 })
    expect(exitCodeFor(summary)).toBe(EXIT_FAIL)
    expect(exitCodeFor({ ok: 2, warn: 1, fail: 0 })).toBe(EXIT_OK)
  })
})

describe('rendering', () => {
  it('renders a railed plain-text check list with hints', () => {
    expect(formatChecks(plain, checks)).toMatchInlineSnapshot(`
      "  │ ✓ node   Node v22.0.0
        │ ⚠ evlog  evlog is not a dependency
        │   └─ pnpm add evlog
        │ ✗ logs   sink unreadable
        │   └─ check permissions"
    `)
  })

  it('renders the summary footer', () => {
    expect(formatSummary(plain, summarize(checks))).toBe('\n  ▍ 1 ok · 1 warn · 1 fail\n')
  })

  it('renders the branded header without ANSI when colors are off', () => {
    expect(formatHeader(plain, { command: 'doctor', version: '0.0.0' }))
      .toBe('\n  ▍ evlog doctor · v0.0.0 · evlog.dev (https://evlog.dev)\n')
  })

  it('never leaks ANSI codes in plain mode', () => {
    const output = [
      formatHeader(plain, { version: '0.0.0' }),
      formatChecks(plain, checks),
      formatSummary(plain, summarize(checks)),
    ].join('\n')
    expect(output).not.toContain('\x1B')
  })
})
