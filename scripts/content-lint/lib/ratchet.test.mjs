import { describe, expect, it } from 'vitest'
import { compare, render } from './ratchet.mjs'

const scored = (score, ids = []) => ({ path: 'a.md', score, findings: ids.map(id => ({ id })) })

describe('compare', () => {
  it('passes a file that improved or held', () => {
    expect(compare(scored(85, ['U-14']), scored(90)).verdict).toBe('better')
    expect(compare(scored(90), scored(90)).verdict).toBe('same')
  })

  it('fails a file that lost points', () => {
    expect(compare(scored(90), scored(85, ['U-14'])).verdict).toBe('worse')
  })

  it('fails a trade at an equal score', () => {
    // A dash swapped for a hollow superlative costs the same and is not progress.
    const verdict = compare(scored(95, ['U-14']), scored(95, ['T-01']))

    expect(verdict.verdict).toBe('worse')
    expect(verdict.appeared).toEqual(['T-01'])
  })

  it('treats a file with no past as new rather than as a regression', () => {
    expect(compare(null, scored(80, ['U-14'])).verdict).toBe('new')
  })
})

describe('render', () => {
  it('says plainly when nothing regressed', () => {
    expect(render([compare(scored(90), scored(95))])).toContain('came back worse')
  })

  it('names what appeared when something did', () => {
    expect(render([compare(scored(95), scored(95, ['T-03']))])).toContain('introduced T-03')
  })
})
