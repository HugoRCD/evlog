import { describe, expect, it } from 'vitest'
import { formatDebugReport } from '../src/lib/debug-report'

describe('formatDebugReport', () => {
  const ctx = { color: false }

  it('renders a scannable case file for soft findings', () => {
    const out = formatDebugReport({
      command: 'doctor',
      cwd: '/tmp',
      steps: ['resolveProject', 'resolveEvlog', 'done'],
      findings: [
        {
          id: 'project',
          status: 'warn',
          code: 'cli.PROJECT_NO_PACKAGE',
          why: 'Doctor needs a package root',
          fix: 'Pass --cwd',
        },
      ],
      resolveTried: [
        { base: '/tmp', method: 'require', ok: false, error: 'no package.json' },
        { base: '/tmp', method: 'fs', ok: false, error: 'not found' },
      ],
    }, ctx)

    expect(out).toContain('── debug')
    expect(out).toContain('command  doctor')
    expect(out).toContain('cwd      /tmp')
    expect(out).toContain('resolveProject → resolveEvlog → done')
    expect(out).toContain('cli.PROJECT_NO_PACKAGE')
    expect(out).toContain('why  Doctor needs a package root')
    expect(out).toContain('fix  Pass --cwd')
    expect(out).toContain('resolve  0/2 probes ok')
    expect(out).toContain('--json --debug')
    expect(out).not.toContain('"resolveTried"')
  })

  it('renders error catalog fields when present', () => {
    const out = formatDebugReport({
      command: 'doctor',
      steps: ['resolveProject'],
      error: {
        code: 'cli.COMMAND_FAILED',
        message: 'boom',
        why: 'unexpected',
        fix: 're-run with --debug',
      },
    }, ctx)

    expect(out).toContain('cli.COMMAND_FAILED')
    expect(out).toContain('boom')
    expect(out).toContain('why  unexpected')
  })
})
