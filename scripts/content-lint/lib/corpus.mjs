/**
 * The evlog tell corpus.
 *
 * Ids match `.agents/skills/write-evlog-content/references/ai-tells.md` so the
 * scanner and the reviewing model share one vocabulary. A hit here is a
 * candidate, never a verdict: the skill entry for each id carries the legitimate
 * twin that decides it.
 *
 * The vocabulary comes from the public research on machine-written prose
 * (Wikipedia's "Signs of AI writing", published word-frequency comparisons,
 * and the tics developers report about their assistants). It is generic, and it
 * is the least valuable half. What makes a finding here is the per-surface
 * budget below and the twin in the skill, both derived from reading this
 * corpus: an API reference trips half these shapes lawfully.
 */

/** @typedef {{ id: string, title: string, weight: number, phrases: string[], note?: string }} PhraseTell */

/** @type {PhraseTell[]} */
export const PHRASE_TELLS = [
  {
    id: 'T-01',
    title: 'Hollow superlative',
    weight: 2,
    phrases: [
      'seamless',
      'seamlessly',
      'effortless',
      'effortlessly',
      'powerful',
      'blazing',
      'blazingly',
      'lightning-fast',
      'cutting-edge',
      'state-of-the-art',
      'game-changing',
      'game-changer',
      'revolutionary',
      'next-level',
      'world-class',
      'best-in-class',
      'incredibly',
      'extremely',
      'virtually',
      'unparalleled',
      'unmatched',
      'elegant',
      'delightful',
      'magical',
    ],
    note: 'Legitimate when glossed by a mechanism or a measured number in the same sentence.',
  },
  {
    id: 'T-01',
    title: 'Vocabulary overrepresented in generated prose',
    weight: 1,
    phrases: [
      'leverage',
      'leveraging',
      'utilize',
      'utilizing',
      'empower',
      'empowers',
      'unlock',
      'unlocks',
      'streamline',
      'streamlines',
      'foster',
      'holistic',
      'robust',
      'comprehensive',
      'multifaceted',
      'myriad',
      'plethora',
      'realm',
      'landscape',
      'paradigm',
      'transformative',
      'pivotal',
      'crucial',
      'underscores',
      'delve',
      'tapestry',
      'testament',
      'meticulously',
      'intricate',
      'vibrant',
      'resonate',
      'captivating',
    ],
    note: 'Weak on its own. Two or more in one section is the signal.',
  },
  {
    id: 'T-04',
    title: 'Not just X, it is Y',
    weight: 2,
    phrases: [
      "isn't just",
      'is not just',
      "isn't only",
      'not only a',
      'not merely',
      "it's not about",
      'it is not about',
      "isn't a logger",
      'more than just',
    ],
  },
  {
    id: 'T-08',
    title: 'Throat-clearing',
    weight: 2,
    phrases: [
      "it's important to note",
      'it is important to note',
      "it's worth noting",
      'it is worth noting',
      'it should be noted',
      'keep in mind that',
      'that being said',
      'with that in mind',
      'in conclusion',
      'in summary',
      'at the end of the day',
      'needless to say',
      'as we can see',
      "let's dive in",
      "let's dive into",
      "let's explore",
      "let's take a look",
      'without further ado',
    ],
  },
  {
    id: 'T-08',
    title: 'Hedge on a mechanism',
    weight: 1,
    phrases: [
      'typically',
      'generally',
      'in most cases',
      'usually',
      'more often than not',
      'tends to',
      'can sometimes',
      'may sometimes',
      'should generally',
    ],
    note: 'Legitimate when what varies is named: runtime, framework, user configuration.',
  },
  {
    id: 'T-13',
    title: 'Assistant framing',
    weight: 3,
    phrases: [
      'great question',
      'certainly!',
      'absolutely!',
      'i hope this helps',
      'let me know if',
      "here's a breakdown",
      "let's break it down",
      'in this article',
      'in this guide, we will',
      'in this post we will',
      'by the end of this',
      'as an ai',
    ],
    note: 'No twin outside a ::prompt block. Flag every occurrence.',
  },
  {
    id: 'T-09',
    title: 'Universal opener',
    weight: 2,
    phrases: [
      'in today',
      'in the modern era',
      'in the world of',
      'in the ever-evolving',
      'ever-changing landscape',
      'every application',
      'every developer knows',
      'as developers, we',
      'we all know that',
    ],
    note: 'Only a tell in the first paragraph of a page or a section.',
  },
  {
    id: 'T-15',
    title: 'Retired entry point',
    weight: 3,
    phrases: ['evlog/shared', 'evlog/browser'],
    note: 'Always critical. The public names are evlog/toolkit and evlog/http.',
  },
]

/**
 * evlog's own vocabulary (U-15). Each entry is a thing evlog named, and the
 * words people reach for instead.
 *
 * Every one of these has a lawful twin, which is why they are candidates and
 * not rules: `transport` is pino's word and a comparison page has to use it,
 * `child logger` is what the reader arrives knowing. The finding is a page
 * using the other name for evlog's own concept.
 */
export const TERMINOLOGY = [
  { canonical: 'drain', wrong: ['log sink', 'sink', 'transport', 'exporter'] },
  { canonical: 'enricher', wrong: ['enrichment plugin', 'enrichment hook', 'context provider'] },
  { canonical: 'error catalog', wrong: ['error registry', 'error map', 'error dictionary'] },
  { canonical: 'log.fork()', wrong: ['child logger', 'sub-logger', 'subloggers'] },
  { canonical: 'wide event', wrong: ['wide log', 'fat event', 'mega event'] },
]

/** Tools evlog is compared against. A claim about one of these is a claim about someone else's software (U-12). */
export const ALTERNATIVES = [
  'pino',
  'winston',
  'bunyan',
  'consola',
  'signale',
  'log4js',
  'roarr',
  'opentelemetry',
  'otel',
]

/** Words that turn naming an alternative into a claim about it. */
const COMPARATIVE = /\b(unlike|whereas|slower|faster|heavier|lighter|worse|better|lacks?|cannot|can't|does ?n[o']t|has no|have no|without|instead of|beats?|outperforms?)\b/i

const CONTRACTION = /\b[A-Za-z]+['’](s|t|re|ve|ll|d|m)\b/g
const EXPANDED = /\b(do not|does not|did not|is not|are not|was not|were not|cannot|can not|will not|would not|should not|could not|have not|has not|had not|it is|that is|there is|you are|we are|they are|you will|we will|let us)\b/gi

/**
 * The alternative this sentence makes a claim about, or null when it only names
 * one. Whether the claim is backed is decided by the caller, which has the
 * page's links.
 *
 * @param {string} text
 * @returns {string | null}
 */
export function comparativeClaim(text) {
  const lower = text.toLowerCase()
  const tool = ALTERNATIVES.find(name => new RegExp(`\\b${name}\\b`).test(lower))
  if (!tool || !COMPARATIVE.test(text)) return null
  return tool
}

/**
 * Names evlog gave a concept, used under someone else's name.
 *
 * @param {string} text
 * @returns {{ canonical: string, wrong: string }[]}
 */
export function offNameTerms(text) {
  const lower = text.toLowerCase()
  const hits = []

  for (const entry of TERMINOLOGY) {
    for (const wrong of entry.wrong) {
      if (new RegExp(`\\b${wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower)) {
        hits.push({ canonical: entry.canonical, wrong })
      }
    }
  }

  return hits
}

/** Openers treated as imperative when classifying headings (T-06). */
export const IMPERATIVE_VERBS = [
  'add',
  'build',
  'catch',
  'choose',
  'configure',
  'connect',
  'create',
  'debug',
  'define',
  'deploy',
  'disable',
  'drain',
  'emit',
  'enable',
  'extend',
  'find',
  'fix',
  'get',
  'handle',
  'install',
  'keep',
  'log',
  'make',
  'measure',
  'move',
  'pick',
  'read',
  'redact',
  'run',
  'sample',
  'send',
  'set',
  'ship',
  'start',
  'stop',
  'test',
  'track',
  'use',
  'verify',
  'wire',
  'wrap',
  'write',
]

/**
 * Contraction opportunities in a span: what was contracted, and what could have
 * been. The ratio is only meaningful with a handful of opportunities.
 *
 * @param {string} text
 * @returns {{ contracted: number, expanded: number }}
 */
export function contractionCounts(text) {
  return {
    contracted: (text.match(CONTRACTION) ?? []).length,
    expanded: (text.match(EXPANDED) ?? []).length,
  }
}

/**
 * Locate every phrase tell in a span.
 *
 * @param {string} text
 * @param {number} line
 * @returns {{ id: string, title: string, weight: number, phrase: string, line: number, excerpt: string }[]}
 */
export function findPhrases(text, line, context = '') {
  const hits = []
  const haystack = text.toLowerCase()

  for (const tell of PHRASE_TELLS) {
    for (const phrase of tell.phrases) {
      let from = 0
      for (;;) {
        const at = haystack.indexOf(phrase, from)
        if (at === -1) break
        from = at + phrase.length
        if (!isWordBoundary(haystack, at, phrase)) continue
        hits.push({
          id: tell.id,
          title: tell.title,
          weight: tell.weight,
          phrase,
          line,
          excerpt: context || excerptAround(text, at, phrase.length),
        })
      }
    }
  }

  return hits
}

/**
 * @param {string} haystack
 * @param {number} at
 * @param {string} phrase
 * @returns {boolean}
 */
function isWordBoundary(haystack, at, phrase) {
  const before = haystack[at - 1]
  const after = haystack[at + phrase.length]
  const isWord = /[a-z0-9]/
  if (before && isWord.test(before)) return false
  if (after && isWord.test(after) && !phrase.endsWith('/')) return false
  return true
}

/**
 * @param {string} text
 * @param {number} at
 * @param {number} length
 * @returns {string}
 */
function excerptAround(text, at, length) {
  const start = Math.max(0, at - 40)
  const end = Math.min(text.length, at + length + 40)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}
