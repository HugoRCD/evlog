/**
 * Document-scale measurements.
 *
 * Every function here returns numbers and located candidates. None of them
 * decides anything: the thresholds live in `score.mjs` and the verdict lives
 * with the reviewer, who has the twins from the skill.
 */

import { ALTERNATIVES, IMPERATIVE_VERBS, comparativeClaim, contractionCounts, findPhrases, offNameTerms } from './corpus.mjs'
import { sentences, wordCount } from './mdc.mjs'

/**
 * @param {import('./mdc.mjs').ParsedDoc} doc
 * @returns {object}
 */
export function measure(doc) {
  const prose = doc.paragraphs.map(paragraph => paragraph.text)
  const listText = doc.lists.flatMap(list => list.items.map(item => item.text))
  const words = [...prose, ...listText].reduce((total, text) => total + wordCount(text), 0)
  const per1000 = count => (words === 0 ? 0 : round((count / words) * 1000))

  const allSentences = prose.flatMap(text => sentences(text))
  const lengths = allSentences.map(sentence => wordCount(sentence))

  return {
    words,
    paragraphs: doc.paragraphs.length,
    sentences: allSentences.length,
    codeBlocks: doc.code.length,
    links: doc.links.length,
    semicolonPer1000: per1000(countChar(prose, ';')),
    sentenceLengthCv: round(coefficientOfVariation(lengths)),
    paragraphLengthCv: round(coefficientOfVariation(prose.map(text => wordCount(text)))),
    ...contractionMetrics(doc),
    dashes: dashes(doc),
    epigrams: epigrams(doc),
    headings: headingShape(doc),
    bulletFrames: bulletFrames(doc),
    unbackedSections: unbackedSections(doc),
    phrases: phraseHits(doc),
    offName: offName(doc),
    comparisons: comparisons(doc),
    alternatives: mentionedAlternatives(doc),
  }
}

/**
 * Which other loggers the page names at all, comparative or not. A mention
 * with no claim attached trips nothing, and still means every sentence around
 * it answers to a dossier.
 *
 * @param {import('./mdc.mjs').ParsedDoc} doc
 * @returns {string[]}
 */
function mentionedAlternatives(doc) {
  const text = proseSpans(doc).map(span => span.text).join(' ').toLowerCase()
  return ALTERNATIVES.filter(name => new RegExp(`\\b${name}\\b`).test(text))
}

/**
 * Paragraphs and list items, the two places prose lives.
 *
 * @param {import('./mdc.mjs').ParsedDoc} doc
 * @returns {{ text: string, line: number }[]}
 */
function proseSpans(doc) {
  return [
    ...doc.paragraphs.map(paragraph => ({ text: paragraph.text, line: paragraph.line })),
    ...doc.lists.flatMap(list => list.items),
  ]
}

/**
 * evlog concepts named after someone else's word for them (U-15).
 *
 * @param {import('./mdc.mjs').ParsedDoc} doc
 */
function offName(doc) {
  const hits = []

  for (const span of proseSpans(doc)) {
    for (const sentence of sentences(span.text)) {
      for (const term of offNameTerms(sentence, span.text)) {
        hits.push({ ...term, line: span.line, excerpt: sentence })
      }
    }
  }

  return hits
}

/**
 * Claims about another logger with nothing behind them (U-12). A number in the
 * sentence or a link on the line counts as backing; the reviewer decides
 * whether it backs this particular claim.
 *
 * @param {import('./mdc.mjs').ParsedDoc} doc
 */
function comparisons(doc) {
  const unbacked = []

  for (const span of proseSpans(doc)) {
    const linked = doc.links.some(link => link.line === span.line)
    for (const sentence of sentences(span.text)) {
      const tool = comparativeClaim(sentence)
      if (!tool || linked || /\d/.test(sentence)) continue
      unbacked.push({ tool, line: span.line, excerpt: sentence })
    }
  }

  return unbacked
}

/**
 * Contraction ratio for the page, plus the sharpest jump between two adjacent
 * paragraphs that both had opportunities, which is the register seam of T-11.
 *
 * @param {import('./mdc.mjs').ParsedDoc} doc
 */
function contractionMetrics(doc) {
  let contracted = 0
  let expanded = 0
  /** @type {{ ratio: number, line: number }[]} */
  const perParagraph = []

  for (const paragraph of doc.paragraphs) {
    const counts = contractionCounts(paragraph.text)
    contracted += counts.contracted
    expanded += counts.expanded
    const opportunities = counts.contracted + counts.expanded
    if (opportunities >= 2) {
      perParagraph.push({ ratio: counts.contracted / opportunities, line: paragraph.line })
    }
  }

  let seam = null
  for (let index = 1; index < perParagraph.length; index += 1) {
    const delta = Math.abs(perParagraph[index].ratio - perParagraph[index - 1].ratio)
    if (!seam || delta > seam.delta) {
      seam = { delta: round(delta), line: perParagraph[index].line }
    }
  }

  const opportunities = contracted + expanded
  return {
    contractionRatio: opportunities === 0 ? null : round(contracted / opportunities),
    contractionOpportunities: opportunities,
    contractionSeam: seam,
  }
}

/**
 * Paragraph closers that are short and carry nothing measurable: no number, no
 * symbol, no link. The count matters, not the instance (T-03).
 *
 * @param {import('./mdc.mjs').ParsedDoc} doc
 */
function epigrams(doc) {
  const candidates = []
  let eligible = 0

  for (const paragraph of doc.paragraphs) {
    // A card body is a caption for the link it sits on, sized to the tile. It
    // has no place in the page's rhythm and every one of them would close short.
    if (paragraph.component === 'card') continue
    const parts = sentences(paragraph.text)
    if (parts.length < 2) continue
    eligible += 1
    const last = parts.at(-1)
    const length = wordCount(last)
    if (length > 8 || length < 2) continue
    // `code` is the whole-word placeholder `cleanInline` leaves behind, so a
    // substring test would also exempt `encoded` and `decode`.
    if (/\d/.test(last) || /\bcode\b/.test(last)) continue
    // A closer pointing somewhere carries something: the destination.
    const labels = doc.links.filter(link => link.line === paragraph.line).map(link => link.text)
    if (labels.some(label => label && last.includes(label))) continue
    // A closer ending on a colon introduces what comes next. `Never log:` above
    // a table of categories is the table's sentence, not a flourish.
    if (last.trimEnd().endsWith(':')) continue
    candidates.push({ line: paragraph.line, text: last })
  }

  return { eligible, count: candidates.length, ratio: eligible === 0 ? 0 : round(candidates.length / eligible), candidates }
}

/**
 * Every em dash and en dash in the prose, located (U-14). Not a rate: evlog
 * does not use this punctuation, so each one is an occurrence to remove and the
 * reviewer needs the line, not a density.
 *
 * @param {import('./mdc.mjs').ParsedDoc} doc
 */
function dashes(doc) {
  const found = []

  // Headings count. They are the first prose a reader sees and the rule says
  // any surface, so a dash hiding in `## Network bridge — stream server` is the
  // one most likely to be read.
  for (const heading of doc.headings) {
    if (/[—–]/.test(heading.text)) found.push({ line: heading.line, text: heading.text })
  }

  for (const paragraph of doc.paragraphs) {
    for (const sentence of sentences(paragraph.text)) {
      if (/[—–]/.test(sentence)) found.push({ line: paragraph.line, text: sentence })
    }
  }

  // A bullet is prose too, and a `Next steps` list is where the dash survives
  // longest. Table cells are left alone: a cell is a fragment, and a dash
  // between two of its parts is layout rather than punctuation.
  for (const list of doc.lists) {
    for (const item of list.items) {
      if (/[—–]/.test(item.text)) found.push({ line: item.line, text: item.text })
    }
  }

  return { count: found.length, occurrences: found.slice(0, 8) }
}

/** Above this many words of prose, a section is explaining rather than listing. */
const ENUMERATING_PROSE = 40

/**
 * Share of sections that list rather than argue: a table or a fence, and barely
 * any prose around it. Parallel headings over parallel entries is the twin
 * `ai-tells.md` names for T-06, and this is what it looks like in the file.
 *
 * @param {import('./mdc.mjs').ParsedDoc} doc
 * @param {{ line: number }[]} targets Headings that open a section.
 */
function enumerationShare(doc, targets) {
  let enumerating = 0

  for (const [index, heading] of targets.entries()) {
    const end = targets[index + 1]?.line ?? Number.POSITIVE_INFINITY
    const within = span => span.line > heading.line && span.line < end
    const prose = doc.paragraphs.filter(within).reduce((total, paragraph) => total + wordCount(paragraph.text), 0)
    if (prose < ENUMERATING_PROSE && (doc.tableRows.some(within) || doc.code.some(within))) enumerating += 1
  }

  return round(enumerating / targets.length)
}

/**
 * Grammatical shape of the h2/h3 set (T-06). A page whose headings all fit one
 * mould got its structure from a template, unless the content is genuinely
 * parallel, as in an API list or an ordered guide.
 *
 * @param {import('./mdc.mjs').ParsedDoc} doc
 */
function headingShape(doc) {
  const targets = doc.headings.filter(heading => heading.depth === 2 || heading.depth === 3)
  if (targets.length < 3) return { count: targets.length, dominant: null, share: 0, symbolShare: 0, enumerationShare: 0 }

  const shapes = targets.map(heading => classifyHeading(heading.text))
  const tally = new Map()
  for (const shape of shapes) tally.set(shape, (tally.get(shape) ?? 0) + 1)
  const [dominant, top] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]

  return {
    count: targets.length,
    dominant,
    share: round(top / targets.length),
    symbolShare: round(shapes.filter(shape => shape === 'symbol').length / targets.length),
    enumerationShare: enumerationShare(doc, targets),
    // Kept so the scorer can subtract the headings this page shares with its
    // siblings and re-judge the shape of what is left.
    texts: targets.map(heading => heading.text.trim().toLowerCase()),
    shapes,
  }
}

/**
 * @param {string} text
 * @returns {'symbol' | 'question' | 'imperative' | 'declarative' | 'noun'}
 */
function classifyHeading(text) {
  const trimmed = text.trim()
  if (/^code$/.test(trimmed) || /^[a-z][A-Za-z]*\(\)?$/.test(trimmed)) return 'symbol'
  // `cleanInline` leaves `code` where a symbol was, so a heading opening on one
  // is an API entry however it continues: `` `log.set()` — final snapshot ``.
  if (/^code\b/.test(trimmed)) return 'symbol'
  // A numbered heading is a position in an ordered guide. The steps of one
  // procedure share a shape because they are one procedure, which is the twin
  // `T-06` is meant to spare.
  if (/^(?:step\s+)?\d+\s*[.):—–]?\s/i.test(trimmed)) return 'sequence'
  if (trimmed.endsWith('?')) return 'question'
  const first = trimmed.toLowerCase().split(/\s+/)[0]
  if (IMPERATIVE_VERBS.includes(first)) return 'imperative'
  if (/\b(is|are|was|were|has|have|does|do|can|will|becomes|makes|gives|takes)\b/i.test(trimmed)) {
    return 'declarative'
  }
  return 'noun'
}

/**
 * Lists whose items share one syntactic frame (T-07). Reported per list so a
 * lawful options table stays distinguishable from an anaphoric run.
 *
 * @param {import('./mdc.mjs').ParsedDoc} doc
 */
function bulletFrames(doc) {
  const locked = []

  for (const list of doc.lists) {
    if (list.items.length < 3) continue
    // Two openers are shared by construction rather than by voice: a task
    // list's checkbox, and the `code` placeholder every item starting with a
    // symbol or a code-labelled link leaves behind. An ordinal never reaches
    // here, since `parseMarkdown` strips it off an ordered list.
    const firsts = list.items
      .map(item => item.text
        .toLowerCase()
        .replace(/^\[[ x]?\]\s*/, '')
        // Emphasis around the opener is styling. `**code**` is the same symbol
        // as `code` and carries the same absence of voice.
        .replace(/^[*_]+/, '')
        .split(/\s+/)[0] ?? '')
      .map(first => first.replace(/^code\b.*/, 'code'))
      // `code` is the placeholder a symbol or a code-labelled link leaves
      // behind. Several items opening on one carries no voice, so it cannot be
      // the anaphora this looks for.
      .filter(first => first !== 'code')
    if (firsts.length < 3) continue
    const tally = new Map()
    for (const first of firsts) tally.set(first, (tally.get(first) ?? 0) + 1)
    const top = Math.max(...tally.values())
    const share = top / firsts.length
    const lengths = list.items.map(item => wordCount(item.text))
    if (share >= 0.75 || coefficientOfVariation(lengths) < 0.15) {
      locked.push({ line: list.line, items: list.items.length, opening: firsts.length, anaphoraShare: round(share) })
    }
  }

  return locked
}

/**
 * Sections that assert behavior with nothing a reader can check: no code, no
 * link, no number (T-14). An approximation the reviewer confirms by reading.
 *
 * @param {import('./mdc.mjs').ParsedDoc} doc
 */
function unbackedSections(doc) {
  const anchors = doc.headings.filter(heading => heading.depth === 2 || heading.depth === 3)
  if (anchors.length === 0) return []

  const bounds = anchors.map((heading, index) => ({
    heading: heading.text,
    from: heading.line,
    to: anchors[index + 1]?.line ?? Number.POSITIVE_INFINITY,
  }))

  return bounds
    .map((section) => {
      // Bullets are prose too. Counting only paragraphs called a section of
      // measured bullets unbacked, and left a section written entirely as
      // bullets at zero words, where nothing is ever reported.
      const within = span => span.line > section.from && span.line < section.to
      const spans = [
        ...doc.paragraphs.filter(within),
        ...doc.lists.flatMap(list => list.items).filter(within),
      ]
      const words = spans.reduce((total, span) => total + wordCount(span.text), 0)
      const hasCode = doc.code.some(within)
      const hasLink = doc.links.some(within)
      const hasNumber = spans.some(span => /\d/.test(span.text))
      const hasSymbol = doc.inlineCode.some(within)
      const backed = hasCode || hasLink || hasNumber || hasSymbol
      return { heading: section.heading, line: section.from, words, backed }
    })
    .filter(section => !section.backed && section.words >= 80)
}

/**
 * @param {import('./mdc.mjs').ParsedDoc} doc
 */
function phraseHits(doc) {
  const prose = [
    ...doc.paragraphs.map(p => ({ text: p.text, line: p.line })),
    ...doc.lists.flatMap(list => list.items),
    ...doc.headings.map(h => ({ text: h.text, line: h.line })),
  ]

  // Retired entry points live in backticks, where the prose only sees a
  // placeholder. Scan the token, but carry the sentence around it: a page
  // documenting a deprecation names the retired path on purpose.
  const surrounding = new Map([...doc.tableRows, ...prose].map(span => [span.line, span.text]))
  const symbols = doc.inlineCode.map(item => ({
    text: item.token,
    line: item.line,
    context: surrounding.get(item.line) ?? '',
  }))

  return [...prose, ...symbols].flatMap(span => findPhrases(span.text, span.line, span.context))
}

/**
 * @param {string[]} texts
 * @param {string} char
 * @returns {number}
 */
function countChar(texts, char) {
  return texts.reduce((total, text) => total + occurrences(text, char), 0)
}

/**
 * @param {string} text
 * @param {string} char
 * @returns {number}
 */
function occurrences(text, char) {
  return text.split(char).length - 1
}

/**
 * @param {number[]} values
 * @returns {number}
 */
function coefficientOfVariation(values) {
  if (values.length < 2) return 1
  const mean = values.reduce((total, value) => total + value, 0) / values.length
  if (mean === 0) return 1
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance) / mean
}

/**
 * @param {number} value
 * @returns {number}
 */
function round(value) {
  return Math.round(value * 100) / 100
}
