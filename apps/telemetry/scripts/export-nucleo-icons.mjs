/**
 * Exports the dashboard's icon selection from a local Nucleo.app library into
 * `app/assets/icons/nucleo/`, where Nuxt Icon picks them up as the custom
 * `nucleo` collection (`i-nucleo-<name>`).
 *
 * Two styles on purpose:
 * - "glass" (Nucleo Glass Essential) for display icons — card headers and
 *   stat cards. Multi-color SVGs (gradients/masks), rendered as-is.
 * - "outline" (Nucleo UI Essential & friends) for functional glyphs —
 *   chevrons, controls, badges. Normalized to `currentColor`.
 *
 * Usage: node scripts/export-nucleo-icons.mjs
 * Requires a local Nucleo install (`NUCLEO_DIR` overrides the default
 * macOS location) and the `sqlite3` CLI on PATH.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const NUCLEO_DIR = process.env.NUCLEO_DIR
  ?? join(process.env.HOME ?? '', 'Library/Application Support/Nucleo/icons')
const DB = join(NUCLEO_DIR, 'data.sqlite3')
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../app/assets/icons/nucleo')

/** Nucleo set ids in this library (see the `sets` table). */
const SETS = {
  glass: 3, // Nucleo Glass Essential
  ui: 5, // Nucleo UI Essential
  core: 6, // Nucleo Core Essential
  dev: 15, // Design/Development
  media: 35, // Sound/Music
  layout: 40, // UI/Layout
}

/**
 * Output name → source. Glass entries render with their built-in colors;
 * outline entries are normalized to `currentColor`.
 */
const ICONS = [
  // Glass — display icons (headers, stat cards)
  { out: 'code-editor', set: SETS.glass, name: 'code-editor', style: 'glass' },
  { out: 'clipboard-check', set: SETS.glass, name: 'clipboard-check', style: 'glass' },
  { out: 'triangle-warning', set: SETS.glass, name: 'triangle-warning', style: 'glass' },
  { out: 'laptop-mobile', set: SETS.glass, name: 'laptop-mobile', style: 'glass' },
  { out: 'dial', set: SETS.glass, name: 'dial', style: 'glass' },
  { out: 'gauge', set: SETS.glass, name: 'gauge', style: 'glass' },
  { out: 'sparkle', set: SETS.glass, name: 'sparkle', style: 'glass' },
  { out: 'connect', set: SETS.glass, name: 'connect', style: 'glass' },
  { out: 'layers', set: SETS.glass, name: 'layers', style: 'glass' },
  { out: 'bug', set: SETS.glass, name: 'bug', style: 'glass' },
  { out: 'bolt', set: SETS.glass, name: 'bolt', style: 'glass' },
  { out: 'rocket', set: SETS.glass, name: 'rocket', style: 'glass' },
  { out: 'tasks', set: SETS.glass, name: 'tasks', style: 'glass' },
  { out: 'chart-line', set: SETS.glass, name: 'circle-chart-line', style: 'glass' },
  { out: 'ufo', set: SETS.glass, name: 'ufo', style: 'glass' },

  // Outline — functional glyphs
  { out: 'refresh', set: SETS.ui, name: 'refresh-2' },
  { out: 'log-out', set: SETS.ui, name: 'arrow-door-out-3' },
  { out: 'chevron-up', set: SETS.ui, name: 'chevron-up' },
  { out: 'chevron-down', set: SETS.ui, name: 'chevron-down' },
  { out: 'chevrons-expand', set: SETS.ui, name: 'chevron-expand-y' },
  { out: 'loader', set: SETS.ui, name: 'loader' },
  { out: 'circle-info', set: SETS.ui, name: 'circle-info' },
  { out: 'flag', set: SETS.ui, name: 'flag-7' },
  { out: 'tags', set: SETS.ui, name: 'tags' },
  { out: 'calendar', set: SETS.ui, name: 'calendar' },
  { out: 'inbox', set: SETS.ui, name: 'inbox-arrow-down' },
  { out: 'user', set: SETS.ui, name: 'user' },
  { out: 'laptop', set: SETS.ui, name: 'laptop' },
  { out: 'box', set: SETS.ui, name: 'box' },
  { out: 'plug', set: SETS.ui, name: 'plug-2' },
  { out: 'check', set: SETS.ui, name: 'check' },
  { out: 'sparkle-outline', set: SETS.ui, name: 'sparkle-3' },
  { out: 'circle-check', set: SETS.core, name: 'circle-check' },
  { out: 'circle-warning', set: SETS.core, name: 'circle-warning' },
  { out: 'key', set: SETS.core, name: 'key' },
  { out: 'server', set: SETS.dev, name: 'server' },
  { out: 'terminal', set: SETS.dev, name: 'terminal' },
  { out: 'pause', set: SETS.media, name: 'media-pause' },
  { out: 'play', set: SETS.media, name: 'media-play' },
  { out: 'copy', set: SETS.layout, name: 'copy' },
]

function query(sql) {
  return execFileSync('sqlite3', [DB, sql], { encoding: 'utf-8' }).trim()
}

/** Picks the icon row for a mapping — outline style at the largest grid first. */
function findIconId({ set, name, style }) {
  if (style === 'glass') {
    return query(`select id from icons where set_id=${set} and name='${name}' limit 1;`)
  }
  return query(`
    select id from icons where set_id=${set} and name='${name}'
    order by case klass when 'outline' then 0 when 'glyph' then 1 else 2 end, grid desc
    limit 1;
  `)
}

/** Outline sources hardcode black (`#000` or `black`) — swap to currentColor so CSS drives it. */
function normalizeColors(svg) {
  return svg
    .replaceAll(/stroke="(?:#000(?:000)?|black)"/g, 'stroke="currentColor"')
    .replaceAll(/fill="(?:#000(?:000)?|black)"/g, 'fill="currentColor"')
}

mkdirSync(OUT_DIR, { recursive: true })

let failures = 0
for (const icon of ICONS) {
  const id = findIconId(icon)
  if (!id) {
    console.error(`✗ not found: ${icon.name} (set ${icon.set})`)
    failures++
    continue
  }
  let svg = readFileSync(join(NUCLEO_DIR, 'sets', String(icon.set), `${id}.svg`), 'utf-8')
  if (icon.style !== 'glass') svg = normalizeColors(svg)
  writeFileSync(join(OUT_DIR, `${icon.out}.svg`), `${svg.trim()}\n`)
  console.log(`✓ ${icon.out} ← set ${icon.set}/${icon.name} (#${id})`)
}

if (failures > 0) {
  console.error(`\n${failures} icon(s) missing`)
  process.exit(1)
}
