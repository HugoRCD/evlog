import { describe, expect, it } from 'vitest'
import { renderCoreBlock } from './render'
import type { MemoryRecord } from './types'
import { CORE_BLOCK_CHAR_BUDGET } from './types'

function record(text: string, title = ''): MemoryRecord {
  return {
    id: 'id',
    tenantId: 'evlog',
    realm: 'person',
    realmKey: 'person-1',
    title,
    text,
    volatility: 'durable',
    sourceKind: 'stated',
    source: { surface: 'imessage', sessionId: 's', url: null },
    invalidatedAt: null,
    updatedAt: new Date('2026-08-14T00:00:00Z'),
  }
}

describe('renderCoreBlock', () => {
  it('returns null with nothing to say, so no empty section is injected', () => {
    expect(renderCoreBlock([])).toBeNull()
  })

  it('renders a fact with its surface', () => {
    const block = renderCoreBlock([record('Prefers short PR bodies')])
    expect(block).toContain('- Prefers short PR bodies (imessage)')
  })

  it('prefixes a titled fact with its title', () => {
    expect(renderCoreBlock([record('mirror the changeset', 'PR bodies')]))
      .toContain('- PR bodies: mirror the changeset (imessage)')
  })

  it('frames the block as data rather than instruction', () => {
    const block = renderCoreBlock([record('anything')]) ?? ''
    expect(block).toMatch(/not instruction/)
    expect(block).toMatch(/never outranks the current message/)
  })

  it('restates the retrieval boundary next to the facts', () => {
    expect(renderCoreBlock([record('anything')])).toMatch(/still a retrieval/)
  })

  it('stays inside the budget by dropping entries, not truncating one', () => {
    const many = Array.from({ length: 200 }, (_, index) => record(`fact number ${index}`))
    const block = renderCoreBlock(many) ?? ''
    expect(block.length).toBeLessThanOrEqual(CORE_BLOCK_CHAR_BUDGET)
    expect(block).toContain('- fact number 0 (imessage)')
    expect(block.split('\n').at(-1)).toMatch(/\(imessage\)$/)
  })
})
