/**
 * The scanner's calibration, pinned to two pages.
 *
 * `generated.md` is saturated on purpose and `written.md` carries the lawful
 * twins: a rule-of-three list, a reference register with even sentences, a
 * short closer that lands a number. A change that narrows the distance between
 * their scores is the change that makes the whole pass worthless, in either
 * direction. The same two files back the content evals in `apps/evi/evals`.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseMarkdown } from './lib/mdc.mjs'
import { measure } from './lib/metrics.mjs'
import { checkDrift, loadApiSurface, loadRoutes } from './lib/drift.mjs'
import { evaluate } from './lib/score.mjs'

const REPO_ROOT = join(import.meta.dirname, '../..')
const api = loadApiSurface(REPO_ROOT)
const routes = loadRoutes(join(REPO_ROOT, 'apps/docs/content'))
const quiet = { sample: 0, epigramRatio: 0 }

/** @param {string} name */
function scan(name) {
  const path = `scripts/content-lint/fixtures/${name}`
  const doc = parseMarkdown(readFileSync(join(REPO_ROOT, path), 'utf8'))
  return evaluate({ path, metrics: measure(doc), drift: checkDrift(doc, api, routes) }, quiet)
}

describe('calibration', () => {
  const generated = scan('generated.md')
  const written = scan('written.md')

  it('ranks the generated page far below the written one', () => {
    expect(generated.score).toBeLessThanOrEqual(40)
    expect(written.score).toBe(100)
  })

  it('names the generated page for the reasons a reviewer would', () => {
    const ids = new Set(generated.findings.map(finding => finding.id))

    expect(ids).toContain('T-13')
    expect(ids).toContain('T-15')
    expect(ids).toContain('U-12')
    expect(ids).toContain('U-15')
  })

  it('leaves the written page alone', () => {
    expect(written.findings).toEqual([])
  })
})
