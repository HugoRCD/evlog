#!/usr/bin/env node
/**
 * Runs any playground or example from the monorepo root, so adding one to
 * `apps/` or `examples/` never means adding a script to the root package.json.
 *
 *   pnpm example              # pick from a list
 *   pnpm example hono         # run examples/hono
 *   pnpm playground next      # run apps/next-playground
 */

import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const color = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code, text) => color ? `\x1B[${code}m${text}\x1B[0m` : text
const dim = text => paint('2', text)
const bold = text => paint('1', text)

/** Every workspace under `dir`, as { slug, name } sorted by slug. */
function collect(dir) {
  const base = join(ROOT, dir)
  if (!existsSync(base)) return []

  return readdirSync(base, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .flatMap((entry) => {
      const manifest = join(base, entry.name, 'package.json')
      if (!existsSync(manifest)) return []

      const { name, scripts } = JSON.parse(readFileSync(manifest, 'utf8'))
      // Skeletons are libraries with nothing to run.
      const script = ['dev', 'start'].find(candidate => scripts?.[candidate])
      if (!name || !script) return []

      return [{ slug: entry.name, name, script }]
    })
    .sort((a, b) => a.slug.localeCompare(b.slug))
}

async function pick(kind, entries) {
  const width = String(entries.length).length

  console.log(`\n${bold(`Which ${kind}?`)}\n`)
  for (const [index, entry] of entries.entries()) {
    console.log(`  ${dim(String(index + 1).padStart(width))}  ${entry.slug}`)
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(`\n${dim('number or name')} ${bold('>')} `)
  rl.close()

  const byIndex = entries[Number(answer) - 1]
  return byIndex ?? entries.find(entry => entry.slug === answer.trim())
}

const kind = process.argv[2] === 'playground' ? 'playground' : 'example'
const query = process.argv[3]
const entries = collect(kind === 'playground' ? 'apps' : 'examples')

if (!entries.length) {
  console.error(`No ${kind} found.`)
  process.exit(1)
}

let target = query
  ? entries.find(entry => entry.slug === query || entry.name === query)
  : await pick(kind, entries)

if (!target && query) {
  // A bare `next` should still find `next-playground`.
  const partial = entries.filter(entry => entry.slug.includes(query))
  if (partial.length === 1) target = partial[0]
}

if (!target) {
  console.error(`\nUnknown ${kind}${query ? ` "${query}"` : ''}. Available:\n`)
  for (const entry of entries) console.error(`  ${entry.slug}`)
  process.exit(1)
}

console.log(`\n${dim('→')} ${bold(target.name)}\n`)

// `dev` goes through turbo so the linked packages get built first; `start`
// is not a turbo task, so it runs straight through pnpm.
const args = target.script === 'dev'
  ? ['exec', 'dotenv', '--', 'turbo', 'run', 'dev', `--filter=${target.name}`]
  : ['exec', 'dotenv', '--', 'pnpm', '--filter', target.name, 'run', target.script]

const child = spawn('pnpm', args, { cwd: ROOT, stdio: 'inherit' })
child.on('exit', code => process.exit(code ?? 0))
