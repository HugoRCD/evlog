/**
 * The check that keeps the corpus from sliding back.
 *
 * A fixed floor is the wrong gate: it fails a new page written at 85 while a
 * page sitting at 60 since last year passes untouched. What a pull request owes
 * is that the files it touched did not get worse, which is a comparison against
 * the same file on the base branch and nothing else.
 */

/**
 * @typedef {{ path: string, score: number, findings: { id: string }[] }} Scored
 */

/**
 * @param {{ id: string }[]} findings
 * @param {string} id
 * @returns {number}
 */
function count(findings, id) {
  return findings.filter(finding => finding.id === id).length
}

/**
 * Compare a file against its own past.
 *
 * A lower score is a regression. So is a finding id that appears more often
 * than it did, even at an equal score: trading a dash for a hollow superlative
 * is not progress, and the total says nothing about which one moved.
 *
 * @param {Scored | null} before Null when the file is new.
 * @param {Scored} after
 * @returns {{ path: string, verdict: 'new' | 'same' | 'better' | 'worse', before: number | null, after: number, appeared: string[] }}
 */
export function compare(before, after) {
  if (before === null) return { path: after.path, verdict: 'new', before: null, after: after.score, appeared: [] }

  const appeared = [...new Set(after.findings.map(finding => finding.id))]
    .filter(id => count(after.findings, id) > count(before.findings, id))
    .sort()

  if (after.score < before.score || appeared.length > 0) {
    return { path: after.path, verdict: 'worse', before: before.score, after: after.score, appeared }
  }
  return {
    path: after.path,
    verdict: after.score > before.score ? 'better' : 'same',
    before: before.score,
    after: after.score,
    appeared: [],
  }
}

/**
 * @param {ReturnType<typeof compare>[]} results
 * @returns {string}
 */
export function render(results) {
  const worse = results.filter(result => result.verdict === 'worse')
  const better = results.filter(result => result.verdict === 'better')
  const fresh = results.filter(result => result.verdict === 'new')

  const lines = [`content-lint --since · ${results.length} file${results.length === 1 ? '' : 's'} changed`, '']

  for (const result of worse) {
    const why = result.appeared.length > 0 ? `introduced ${result.appeared.join(', ')}` : `${result.before} → ${result.after}`
    lines.push(`  worse   ${result.path}  ${why}`)
  }
  for (const result of better) lines.push(`  better  ${result.path}  ${result.before} → ${result.after}`)
  for (const result of fresh) lines.push(`  new     ${result.path}  ${result.after}`)

  if (worse.length === 0) lines.push('', '  Nothing this pull request touched came back worse.')
  else lines.push('', `  ${worse.length} file${worse.length === 1 ? '' : 's'} regressed. Run the scanner on them to see what changed.`)

  return `${lines.join('\n')}\n`
}
