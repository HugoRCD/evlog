import { describe, expect, it } from 'vitest'
import { failureComment, failureLine, flattenInline } from './failure'

describe('flattenInline', () => {
  it('flattens whitespace and truncates long values', () => {
    expect(flattenInline('a\n  b\t c')).toBe('a b c')
    const long = flattenInline('x'.repeat(200))
    expect(long.length).toBe(160)
    expect(long.endsWith('…')).toBe(true)
  })

  it('stringifies non-string values, including ones JSON cannot represent', () => {
    expect(flattenInline({ branch: 'main' })).toBe('{"branch":"main"}')
    expect(flattenInline(undefined)).toBe('undefined')
  })
})

describe('failureComment', () => {
  it('carries the hint, the guidance, and the error code', () => {
    const comment = failureComment('I hit an error', 'Mention me again to retry.', {
      code: 'E_TURN',
      message: 'boom\nhappened',
    })
    expect(comment).toBe('I hit an error (boom happened).\n\nMention me again to retry.\n\n_Error code: `E_TURN`_')
  })

  it('omits the hint and code lines when the event has none', () => {
    expect(failureComment('It failed', 'Retry.', {})).toBe('It failed.\n\nRetry.')
  })
})

describe('failureLine', () => {
  it('renders one line with hint and code', () => {
    expect(failureLine('That turn failed', 'Send it again.', { code: 'E1', message: 'nope' }))
      .toBe('That turn failed (nope) [E1]. Send it again.')
  })

  it('renders the bare lead and guidance without event detail', () => {
    expect(failureLine('That turn failed', 'Send it again.', {}))
      .toBe('That turn failed. Send it again.')
  })
})
