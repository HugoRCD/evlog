import { describe, expect, it } from 'vitest'
import { failureComment } from './failure'

describe('failureComment', () => {
  it('includes the lead, hint, guidance, and error code', () => {
    const comment = failureComment('This turn failed', 'Mention me again to retry.', {
      code: 'model_error',
      message: 'upstream timeout',
    })
    expect(comment).toBe(
      'This turn failed (upstream timeout).\n\nMention me again to retry.\n\n_Error code: `model_error`_',
    )
  })

  it('omits the hint and code when absent, and truncates long messages', () => {
    expect(failureComment('This turn failed', 'Retry.', {})).toBe('This turn failed.\n\nRetry.')
    const long = 'x'.repeat(400)
    const comment = failureComment('Failed', 'Retry.', { message: long })
    expect(comment).toContain('…')
    expect(comment.length).toBeLessThan(220)
  })
})
