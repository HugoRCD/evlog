import { describe, expect, it } from 'vitest'
import { exampleRunEvent } from '../src/disclosure'
import { IngestValidationError, parseIngestBody } from '../src/ingest'

const OPTIONS = {
  allowedTools: ['my-tool'],
  allowedCustomKeys: {
    'my-tool': ['checksFailed', 'itemsSynced'],
  },
} as const

function body(events: unknown[]): string {
  return JSON.stringify({ events })
}

describe('parseIngestBody', () => {
  it('accepts a valid batch', () => {
    const event = exampleRunEvent({
      tool: { name: 'my-tool', version: '1.0.0' },
      custom: { checksFailed: 2, itemsSynced: 10, secret: 'nope' },
    })
    const parsed = parseIngestBody(body([event]), OPTIONS)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.custom).toEqual({ checksFailed: 2, itemsSynced: 10 })
    expect(parsed[0]?.tool.name).toBe('my-tool')
  })

  it('rejects unknown tools', () => {
    const event = exampleRunEvent({ tool: { name: 'other-tool', version: '1.0.0' } })
    expect(() => parseIngestBody(body([event]), OPTIONS)).toThrow(IngestValidationError)
  })

  it('rejects oversized bodies', () => {
    expect(() => parseIngestBody('x'.repeat(100_000), OPTIONS)).toThrow(/payload too large/)
  })

  it('rejects empty batches', () => {
    expect(() => parseIngestBody(body([]), OPTIONS)).toThrow(/invalid batch/)
  })

  it('rejects invalid json', () => {
    expect(() => parseIngestBody('{bad', OPTIONS)).toThrow(/invalid json/)
  })

  it('rejects missing idempotency key', () => {
    const event = {
      ...exampleRunEvent({ tool: { name: 'my-tool', version: '1.0.0' } }),
      idempotencyKey: '',
    }
    expect(() => parseIngestBody(body([event]), OPTIONS)).toThrow(/idempotency/)
  })
})
