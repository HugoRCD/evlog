/**
 * The fixes with a derivable answer.
 *
 * A rule belongs here only when the corrected text follows from the rule
 * itself, never from taste. `evlog/shared` has exactly one replacement. `sink`
 * has exactly one. Punctuation never does, which is why `U-14` is absent: a
 * dashed span is sometimes an appositive and sometimes a list, and swapping the
 * dashes for commas turns the second kind into a sentence whose subject is
 * followed by four nouns. Measured over this corpus, that was 25 replacements
 * out of 38. Dashes stay a finding for someone who can read the sentence.
 *
 * Everything works on raw text, line by line, because formatting has to survive
 * exactly and a round trip through `parseMarkdown` would not preserve it. Code
 * and prose are separated by hand for the same reason: `T-15` fixes an import
 * and must reach inside a fence, `U-15` fixes a word and must not.
 */

import { readFileSync } from 'node:fs'
import { ALTERNATIVES } from './corpus.mjs'

const FENCE = /^\s*(`{3,}|~{3,})/
/** A component invocation, a slot marker, or an inline component: structure, never prose. */
const MDC_LINE = /^\s*(:{1,}[a-z][\w-]*|#[\w-]+\s*$)/i
const DOCUMENTING_A_DEPRECATION = /\b(deprecat\w*|removed|retired|renamed|legacy|instead of|prefer|migrat\w*|never|not\b)/i
const REDIRECT_ENTRY = /['"](\/[^'"]*)['"]\s*:\s*r\(\s*['"]([^'"]*)['"]\s*\)/g

/** Retired entry points and the ones that replaced them (`T-15`). */
const ENTRY_POINTS = {
  'evlog/shared': 'evlog/toolkit',
  'evlog/browser': 'evlog/http',
}

/**
 * Terms with one replacement and no grammatical consequence (`U-15`).
 *
 * `child logger` is deliberately absent: `log.fork()` does not slot into the
 * same sentence, and half the corpus uses the phrase to explain what fork does.
 */
const TERMS = [
  { from: 'sinks', to: 'drains' },
  { from: 'sink', to: 'drain' },
  { from: 'error registry', to: 'error catalog' },
  { from: 'error registries', to: 'error catalogs' },
]

/**
 * Old path to new, from the docs redirect table. A dead link with a redirect
 * behind it has one correct destination, which makes it a fix rather than a
 * finding.
 *
 * @param {string} file
 * @returns {Map<string, string>}
 */
export function loadRedirects(file) {
  const map = new Map()
  let source = ''
  try {
    source = readFileSync(file, 'utf8')
  } catch {
    return map
  }
  for (const match of source.matchAll(REDIRECT_ENTRY)) map.set(match[1].replace(/\/$/, ''), match[2])
  return map
}

/**
 * Whether a fixed file may be written, given how it scored before and after.
 *
 * Not "the finding cleared": `U-14` and `U-15` are reported once per page, so
 * removing one of four dashes leaves the finding standing and still helped.
 * What has to hold is that nothing got worse and nothing new appeared. This is
 * the whole safety argument for running the codemod unattended.
 *
 * @param {{ score: number, findings: { id: string }[] }} was
 * @param {{ score: number, findings: { id: string }[] }} now
 * @returns {{ safe: true } | { safe: false, why: string }}
 */
export function isSafeFix(was, now) {
  const count = (findings, id) => findings.filter(finding => finding.id === id).length
  const appeared = [...new Set(now.findings.map(finding => finding.id))]
    .filter(id => count(now.findings, id) > count(was.findings, id))
    .sort()

  if (appeared.length > 0) return { safe: false, why: `introduced ${appeared.join(', ')}` }
  if (now.score < was.score) return { safe: false, why: `score ${was.score} to ${now.score}` }
  return { safe: true }
}

/**
 * @typedef {{ id: string, line: number, before: string, after: string }} AppliedFix
 */

/**
 * @param {string} source
 * @param {{ redirects?: Map<string, string> }} [context]
 * @returns {{ source: string, applied: AppliedFix[] }}
 */
export function applyFixes(source, context = {}) {
  const redirects = context.redirects ?? new Map()
  const lines = source.split('\n')
  const applied = []

  let fence = null
  let frontmatter = lines[0]?.trim() === '---'
  let propBlock = false
  let atComponent = false

  const fixed = lines.map((line, index) => {
    const number = index + 1

    if (frontmatter) {
      if (number > 1 && line.trim() === '---') frontmatter = false
      return line
    }

    // A `---` block opening right after a component is that component's props.
    if (propBlock) {
      if (line.trim() === '---') propBlock = false
      return line
    }
    if (atComponent && line.trim() === '---') {
      atComponent = false
      propBlock = true
      return line
    }
    atComponent = false

    const opener = FENCE.exec(line)
    if (fence === null && opener) {
      fence = opener[1]
      return line
    }
    if (fence !== null) {
      if (line.trimStart().startsWith(fence)) fence = null
      else return record(line, fixCode(line), 'T-15')
    }
    if (fence !== null || opener) return line
    // MDC structure is not prose. `::audit-dual-sink` is a Vue component whose
    // file is named for it, and renaming the term in the invocation gives a
    // page that no longer resolves. Prop blocks are configuration for the same
    // reason.
    if (MDC_LINE.test(line)) {
      atComponent = true
      return line
    }

    return record(line, fixProse(line, redirects), null)

    /**
     * @param {string} original
     * @param {{ text: string, ids: string[] }} result
     * @param {string | null} forcedId
     */
    function record(original, result, forcedId) {
      if (result.text === original) return original
      for (const id of forcedId ? [forcedId] : result.ids) {
        applied.push({ id, line: number, before: original.trim(), after: result.text.trim() })
      }
      return result.text
    }
  })

  return { source: fixed.join('\n'), applied }
}

/**
 * Inside a fence: entry points only.
 *
 * @param {string} line
 * @returns {{ text: string, ids: string[] }}
 */
function fixCode(line) {
  if (DOCUMENTING_A_DEPRECATION.test(line)) return { text: line, ids: [] }

  let text = line
  for (const [retired, current] of Object.entries(ENTRY_POINTS)) {
    text = text.replaceAll(retired, current)
  }
  return { text, ids: text === line ? [] : ['T-15'] }
}

/**
 * Outside a fence: entry points inside backticks, everything else outside them.
 * A term in backticks is a symbol, and a symbol is not prose.
 *
 * @param {string} line
 * @param {Map<string, string>} redirects
 * @returns {{ text: string, ids: string[] }}
 */
function fixProse(line, redirects) {
  const ids = new Set()
  const documenting = DOCUMENTING_A_DEPRECATION.test(line)

  // Odd segments are inline code, because splitting on a backtick alternates.
  const text = line
    .split('`')
    .map((segment, index) => {
      if (index % 2 === 1) {
        if (documenting) return segment
        const swapped = fixCode(segment)
        if (swapped.ids.length > 0) ids.add('T-15')
        return swapped.text
      }
      return prose(segment, redirects, ids)
    })
    .join('`')

  return { text, ids: [...ids] }
}

/**
 * @param {string} segment
 * @param {Map<string, string>} redirects
 * @param {Set<string>} ids
 * @returns {string}
 */
function prose(segment, redirects, ids) {
  let text = segment

  const relinked = text.replace(/\]\((\/[^)#?]*)([#?][^)]*)?\)/g, (match, path, suffix) => {
    const to = redirects.get(path.replace(/\/$/, ''))
    return to === undefined ? match : `](${to}${suffix ?? ''})`
  })
  if (relinked !== text) {
    ids.add('U-16')
    text = relinked
  }

  // A sentence naming another logger is allowed to use that logger's words.
  if (!ALTERNATIVES.some(name => new RegExp(`\\b${name}\\b`, 'i').test(text))) {
    for (const term of TERMS) {
      const renamed = text.replace(new RegExp(`\\b${term.from}\\b`, 'gi'), match => matchCase(match, term.to))
      if (renamed !== text) {
        ids.add('U-15')
        text = renamed
      }
    }
  }

  return text
}

/**
 * @param {string} original
 * @param {string} replacement
 * @returns {string}
 */
function matchCase(original, replacement) {
  return /^[A-Z]/.test(original) ? replacement[0].toUpperCase() + replacement.slice(1) : replacement
}
