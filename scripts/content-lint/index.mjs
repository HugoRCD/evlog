#!/usr/bin/env node
/**
 * content-lint: deterministic evidence for an evlog content review.
 *
 * Usage:
 *   node scripts/content-lint                              rank every written surface
 *   node scripts/content-lint apps/docs/content            rank a tree
 *   node scripts/content-lint --top 10                     the worst pages only
 *   node scripts/content-lint <file> --json                one page, machine-readable
 *   node scripts/content-lint --surface skill --top 5      one surface only
 *   node scripts/content-lint --min-score 70               exit 1 below the bar
 *   node scripts/content-lint --url https://…              a page that is not in the repo
 *   cat draft.md | node scripts/content-lint --stdin       prose that is not a file yet
 *
 * The corpus is the docs tree, the landing, the package READMEs, the skills,
 * and the AGENTS.md files. It is defined in `lib/surfaces.mjs`, not here.
 *
 * Nothing this prints is a decision. Every finding carries the id of a rule or
 * tell in `.agents/skills/write-evlog-content/`, and that entry holds the
 * legitimate twin the reviewer weighs it against. `modelChecks` is the other
 * half: what no threshold reached on this page, which the reviewer owes.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMarkdown } from './lib/mdc.mjs'
import { measure } from './lib/metrics.mjs'
import { checkDrift, loadApiSurface, loadRoutes, walk } from './lib/drift.mjs'
import { buildBaseline, evaluate } from './lib/score.mjs'
import { SURFACES, corpusFiles, surfaceOf } from './lib/surfaces.mjs'
import { modelChecks } from './lib/model-checks.mjs'
import { extract } from './lib/extract.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const CONTENT_ROOT = resolve(REPO_ROOT, 'apps/docs/content')

const FETCH_TIMEOUT_MS = 15_000
const MAX_FETCH_BYTES = 4 * 1024 * 1024
/** Below this, extraction found chrome and no article, whatever the page looked like in a browser. */
const MIN_EXTRACTED_CHARS = 200

const argv = process.argv.slice(2)
const options = {
  json: argv.includes('--json'),
  stdin: argv.includes('--stdin'),
  top: numberFlag('--top'),
  minScore: numberFlag('--min-score'),
  surface: surfaceFlag('--surface'),
  url: stringFlag('--url'),
  as: surfaceFlag('--as') ?? 'docs',
  targets: argv.filter(arg => !arg.startsWith('--') && !isFlagValue(arg)),
}

if (options.url !== null && options.stdin) fail('--url and --stdin read different inputs; pass one.')
if (options.url !== null && !/^https?:\/\//i.test(options.url)) {
  fail('--url takes an http or https address.')
}

const REDIRECTS_FILE = resolve(REPO_ROOT, 'apps/docs/config/redirects.ts')
const api = loadApiSurface(REPO_ROOT)
const routes = loadRoutes(CONTENT_ROOT, REDIRECTS_FILE)

// A docs page links by route, a skill links by path. Only the second can be
// resolved on disk, and resolving a route there would report every link.
const LINKS_BY_PATH = new Set(['skill', 'agents', 'readme'])

const scan = (file) => {
  const path = relative(REPO_ROOT, file)
  return {
    path,
    surface: surfaceOf(path),
    ...scanSource(readFileSync(file, 'utf8'), LINKS_BY_PATH.has(surfaceOf(path)) ? file : undefined),
  }
}

/**
 * @param {string} source Markdown.
 * @param {string} [file] Absolute path, when the source is a file on disk.
 */
function scanSource(source, file) {
  const doc = parseMarkdown(source)
  return { metrics: measure(doc), drift: checkDrift(doc, api, routes, file) }
}

// Ad-hoc input is scanned against the corpus baseline but belongs to no file,
// so it carries no drift check that needs a path and takes its surface from
// `--as`. The rest of the pipeline is the one that runs on a docs page.
const loose = options.url
  ? await fromUrl(options.url)
  : options.stdin
    ? { path: '<stdin>', surface: options.as, ...scanSource(await readStdin()) }
    : null

const corpus = corpusFiles(REPO_ROOT).map(file => join(REPO_ROOT, file))

const files = loose || options.targets.length > 0
  ? options.targets.flatMap((target) => {
      const path = resolve(REPO_ROOT, target)
      if (!path.startsWith(`${REPO_ROOT}/`)) fail(`${target} is outside the repository.`)
      if (!existsSync(path)) fail(`${target} does not exist.`)
      return statSync(path).isDirectory() ? walk(path, name => name.endsWith('.md')) : [path]
    })
  : corpus

if (files.length === 0 && loose === null) fail('no markdown files matched')

const scanned = [...files.map(scan), ...(loose ? [loose] : [])]

// The baseline is the corpus, never the selection: a single-page run has to
// return the same verdict it would inside a full sweep.
const baseline = buildBaseline(files.length >= corpus.length ? scanned : corpus.map(file => scan(file)))
const pages = scanned
  .map(page => ({ ...page, ...evaluate(page, baseline) }))
  .map(page => ({ ...page, modelChecks: modelChecks(page) }))
  .filter(page => options.surface === null || page.surface === options.surface)
  .sort((a, b) => a.score - b.score || a.path.localeCompare(b.path))

const selected = options.top ? pages.slice(0, options.top) : pages

if (options.json) {
  process.stdout.write(`${JSON.stringify({ baseline, pages: selected }, null, 2)}\n`)
} else if (selected.length === 1) {
  process.stdout.write(renderPage(selected[0], baseline))
} else {
  process.stdout.write(renderTable(selected, pages.length, baseline))
}

const worst = pages.at(0)
if (options.minScore !== null && worst && worst.score < options.minScore) {
  process.stderr.write(`content-lint: ${worst.path} scored ${worst.score}, below --min-score ${options.minScore}\n`)
  process.exit(1)
}

/**
 * Fetch a page and scan its main content.
 *
 * Extraction is a heuristic and says so: nav, header, footer, and aside are
 * dropped, `<main>` wins over `<article>` wins over the body. A page that
 * renders its prose with script reads as a thin page here, not a clean one.
 *
 * The address comes from a model when the reviewer calls this, so the fetch is
 * bounded on every axis a hostile or merely broken page can stretch: protocol,
 * time, redirects, and bytes.
 *
 * @param {string} url
 */
async function fromUrl(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'evlog-content-lint' },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  }).catch((error) => {
    fail(`${url} could not be fetched: ${error instanceof Error ? error.message : String(error)}`)
  })

  if (!response.ok) fail(`${url} responded ${response.status}`)
  if (!/^text\/(html|markdown|plain)\b/i.test(response.headers.get('content-type') ?? '')) {
    fail(`${url} served ${response.headers.get('content-type') ?? 'no content type'}; expected html, markdown, or plain text`)
  }

  const html = await readCapped(response.body, MAX_FETCH_BYTES, url)
  const { title, markdown } = /<[a-z][^>]*>/i.test(html) ? extract(html) : { title: null, markdown: html }
  if (markdown.length < MIN_EXTRACTED_CHARS) {
    fail(`${url} yielded ${markdown.length} characters of prose; the page is probably script-rendered`)
  }

  const doc = parseMarkdown(markdown)
  return { path: url, surface: options.as, external: true, title, metrics: measure(doc), drift: [] }
}

/**
 * Read a stream up to a byte ceiling, failing rather than truncating: half a
 * page scanned silently is a score that means nothing.
 *
 * @param {ReadableStream<Uint8Array> | null} stream
 * @param {number} limit
 * @param {string} what
 * @returns {Promise<string>}
 */
async function readCapped(stream, limit, what) {
  if (stream === null) return ''
  const chunks = []
  let size = 0

  for await (const chunk of stream) {
    size += chunk.length
    if (size > limit) fail(`${what} is over the ${Math.round(limit / 1024)} KB scan limit`)
    chunks.push(chunk)
  }

  return Buffer.concat(chunks).toString('utf8')
}

/**
 * @returns {Promise<string>}
 */
function readStdin() {
  return readCapped(process.stdin, MAX_FETCH_BYTES, 'stdin')
}

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  process.stderr.write(`content-lint: ${message}\n`)
  process.exit(2)
}

/**
 * @param {object} page
 * @param {object} baseline
 * @returns {string}
 */
function renderPage(page, baseline) {
  const metrics = page.metrics
  const lines = [
    `${page.path}`,
    `  surface ${page.surface} · score ${page.score} · ${metrics.words} words · ${metrics.paragraphs} paragraphs · ${metrics.codeBlocks} code blocks`,
    `  dashes ${metrics.dashes.count} · epigram ratio ${metrics.epigrams.ratio} (corpus median ${baseline.epigramRatio}) · sentence CV ${metrics.sentenceLengthCv} · contractions ${metrics.contractionRatio ?? 'n/a'}`,
    '',
  ]

  if (page.findings.length === 0) {
    lines.push('  no candidates')
  } else {
    for (const finding of page.findings) {
      const where = finding.line ? `:${finding.line}` : ''
      lines.push(`  [${finding.id}] ${finding.severity === 'critical' ? 'critical' : 'standard'} ${page.path}${where}`)
      lines.push(`      ${finding.message}`)
      if (finding.excerpt) lines.push(`      "${finding.excerpt}"`)
    }
  }

  lines.push('', '  Nothing above is decided. Judge each one against its twin in .agents/skills/write-evlog-content/references/ai-tells.md')

  lines.push('', '  What this scan could not measure. Answer these by reading:')
  for (const check of page.modelChecks) lines.push(`  [${check.id}] ${check.ask}`)

  return `${lines.join('\n')}\n`
}

/**
 * @param {object[]} selected
 * @param {number} total
 * @param {object} baseline
 * @returns {string}
 */
function renderTable(selected, total, baseline) {
  const width = Math.max(...selected.map(page => page.path.length))
  const rows = selected.map((page) => {
    const critical = page.findings.filter(finding => finding.severity === 'critical').length
    const ids = [...new Set(page.findings.map(finding => finding.id))].join(' ')
    return `  ${String(page.score).padStart(3)}  ${page.path.padEnd(width)}  ${String(critical).padStart(2)}!  ${ids}`
  })

  const surfaces = [...new Set(selected.map(page => page.surface))].sort()

  return [
    `content-lint · ${total} pages · ${surfaces.join(', ')} · corpus median epigram ratio ${baseline.epigramRatio}`,
    '',
    `  score  ${'page'.padEnd(width)}  crit  candidates`,
    ...rows,
    '',
    `  ${selected.length} shown, worst first. Run a single page for its findings.`,
    '',
  ].join('\n')
}

/**
 * @param {string} name
 * @returns {number | null}
 */
function numberFlag(name) {
  const at = argv.indexOf(name)
  if (at === -1) return null
  const value = Number(argv[at + 1])
  return Number.isFinite(value) ? value : null
}

/**
 * @param {string} name
 * @returns {string | null}
 */
function stringFlag(name) {
  const at = argv.indexOf(name)
  if (at === -1) return null
  const value = argv[at + 1]
  if (value === undefined || value.startsWith('--')) fail(`${name} needs a value.`)
  return value
}

/**
 * A surface name, checked against the ones that exist. An unknown value would
 * otherwise fall through to the docs profile and report thresholds nobody asked
 * for.
 *
 * @param {string} name
 * @returns {string | null}
 */
function surfaceFlag(name) {
  const value = stringFlag(name)
  if (value !== null && !SURFACES.includes(value)) {
    fail(`${name} takes one of: ${SURFACES.join(', ')}. Got "${value}".`)
  }
  return value
}

/**
 * @param {string} arg
 * @returns {boolean}
 */
function isFlagValue(arg) {
  const at = argv.indexOf(arg)
  return at > 0 && ['--top', '--min-score', '--surface', '--url', '--as'].includes(argv[at - 1])
}
