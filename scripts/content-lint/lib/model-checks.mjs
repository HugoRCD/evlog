/**
 * What the scanner could not measure on this page.
 *
 * The findings say what tripped a threshold. This says what no threshold can
 * reach, and it is the more useful half: a reviewer handed only candidates
 * reviews only candidates, and a page can satisfy every count while answering
 * nothing. Each entry names the rule, the question, and where to look.
 *
 * The list is conditioned on the page, not fixed. There is no point asking
 * whether the code samples run on a page with no code, and the question a
 * skill owes is not the question a landing page owes.
 */

import { profileOf } from './surfaces.mjs'

/** Asked of every surface, because nothing about them is string-matchable. */
const ALWAYS = [
  { id: 'U-04', ask: 'Does every claim about behavior carry a mechanism, a measured number with its source, or a link to the page that proves it?' },
  { id: 'U-06', ask: 'Is any sentence two halves saying the same thing? Restatement reads as true on both halves, which is why it survives a read.' },
  { id: 'D-01', ask: 'Name the question the reader arrived with. Does the page answer it, or does it cover the topic?' },
]

const BY_SURFACE = {
  docs: [
    { id: 'U-05', ask: 'Does the opening state the reader\'s situation, or define the topic?' },
    { id: 'U-11', ask: 'Do the headings name what the section does for the reader, or are they noun labels?' },
    { id: 'U-13', ask: 'Where the page describes a feature with a price (a flag, a dependency, a runtime constraint, a field to maintain), is the price next to it?' },
  ],
  reference: [
    { id: 'U-13', ask: 'Are the constraints stated where the reader hits them, rather than in a note at the end?' },
    { id: 'D-07', ask: 'Is anything laid out as prose that is really a table of options?' },
  ],
  landing: [
    { id: 'L-01', ask: 'Does every claim here map to a page that keeps it? Name the page for each.' },
  ],
  blog: [
    { id: 'B-02', ask: 'Does the first paragraph earn the second, for a reader who did not come with a task?' },
    { id: 'B-03', ask: 'Does the post name what it cost or what we got wrong, or only what worked?' },
  ],
  readme: [
    { id: 'U-04', ask: 'Do the badges and the one-line claims survive the substitution test with a competitor\'s name in them?' },
    { id: 'D-10', ask: 'Do the framework list and the adapter list still match `packages/evlog/package.json#exports`?' },
  ],
  skill: [
    { id: 'M-06', ask: 'Does the frontmatter `description` name the situations that should load this file, in the words someone in one would use? It is a routing decision, not a summary.' },
    { id: 'M-04', ask: 'Does the file state its own bounds, including what must never be done under it?' },
    { id: 'M-07', ask: 'Is every workflow, layout, and API here true of `main` as it stands today?' },
  ],
  agents: [
    { id: 'M-07', ask: 'Does every command in the Commands block exist in the matching `package.json`, and every path in the layout block exist on disk?' },
    { id: 'M-04', ask: 'Has a rewrite softened anything in Boundaries? A `never` that became an `avoid` changed behavior.' },
  ],
}

/**
 * @param {{ path: string, surface: string, metrics: object }} page
 * @returns {{ id: string, ask: string }[]}
 */
export function modelChecks(page) {
  const checks = [...ALWAYS, ...(BY_SURFACE[page.surface] ?? [])]
  const metrics = page.metrics

  if (metrics.codeBlocks > 0) {
    checks.push({
      id: 'U-10',
      ask: page.external
        ? `Read the ${metrics.codeBlocks} code block${metrics.codeBlocks === 1 ? '' : 's'}. Would each sample run as written, against the version this page documents?`
        : `Read the ${metrics.codeBlocks} code block${metrics.codeBlocks === 1 ? '' : 's'}. Do the imports resolve, do the symbols exist in \`packages/evlog/src\`, and would the sample run as written? The scanner only checked the import lines.`,
    })
  }

  if (metrics.headings.count >= 3 && profileOf(page.surface).rhythm) {
    checks.push({
      id: 'T-02',
      ask: 'Where the page groups three things, is the third one load-bearing or is it there for the cadence?',
    })
  }

  if (metrics.alternatives.length > 0) {
    checks.push({
      id: 'U-12',
      // Reading someone else's documentation is how a dossier gets refreshed,
      // so the question inverts: here the page is the source and the dossier
      // is the thing that might be wrong.
      ask: page.external
        ? `The page documents or names ${metrics.alternatives.join(', ')}. Compare it against \`references/landscape/\`: anything the page contradicts is a dossier line to correct, with today's date.`
        : `The page names ${metrics.alternatives.join(', ')}. Open the matching \`references/landscape/\` dossier and check every claim against it, including the ones the scanner did not flag because a number happened to sit nearby.`,
    })
  }

  if (metrics.words >= 400) {
    checks.push({
      id: 'T-14',
      ask: 'After each section, what can the reader do that they could not do before? A section whose only answer is "know a thing" needs a reason that outranks the reader\'s time.',
    })
  }

  return checks
}
