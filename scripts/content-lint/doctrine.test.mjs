/**
 * The scanner and the doctrine share one vocabulary, or they share nothing.
 *
 * Every id the scanner can emit has to resolve to an entry a reviewer can
 * read, because a finding is only worth anything if the twin, the worked pair,
 * or the question behind it is findable. The failure this catches is quiet: a
 * rule renamed in the skill, or a check added here against an id nobody ever
 * wrote up, and in both cases the scanner keeps reporting and the reviewer
 * keeps having nothing to judge against.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { walk } from './lib/drift.mjs'

const ROOT = join(import.meta.dirname, '..', '..')
const DOCTRINE = join(ROOT, '.agents/skills/write-evlog-content/references')

/** Ids the scanner can put on a finding or a model check. */
function emittedIds() {
  const ids = new Set()
  for (const file of walk(join(import.meta.dirname, 'lib'), name => name.endsWith('.mjs') && !name.endsWith('.test.mjs'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(/id: '([A-Z]-\d{2})'/g)) ids.add(match[1])
  }
  return ids
}

/** Ids the doctrine defines: a rule entry in `rules/`, or a tell heading in `ai-tells.md`. */
function definedIds() {
  const ids = new Set()

  for (const file of walk(join(DOCTRINE, 'rules'), name => name.endsWith('.md'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(/^\*\*([A-Z]-\d{2}) · /gm)) ids.add(match[1])
  }

  for (const match of readFileSync(join(DOCTRINE, 'ai-tells.md'), 'utf8').matchAll(/^## ([A-Z]-\d{2}) · /gm)) {
    ids.add(match[1])
  }

  return ids
}

describe('the scanner speaks the doctrine\'s vocabulary', () => {
  const emitted = emittedIds()
  const defined = definedIds()

  it('finds ids on both sides at all, so a broken parse fails loudly', () => {
    expect(emitted.size).toBeGreaterThan(20)
    expect(defined.size).toBeGreaterThan(20)
  })

  it('emits nothing the doctrine does not define', () => {
    expect([...emitted].filter(id => !defined.has(id)).sort()).toEqual([])
  })
})
