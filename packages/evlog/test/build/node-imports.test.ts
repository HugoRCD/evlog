import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const distDir = resolve(import.meta.dirname, '../../dist')
const catalogDist = resolve(distDir, 'catalog.mjs')
const distExists = existsSync(catalogDist)

if (!distExists) {
  console.warn('[evlog test] Skipping dist node imports: dist/ not found. Run `pnpm --filter evlog run build` first.')
}

function readDist(relativePath: string): string {
  return readFileSync(resolve(distDir, relativePath), 'utf8')
}

function listDistFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string, prefix = '') => {
    for (const entry of readdirSync(dir)) {
      const rel = prefix ? `${prefix}/${entry}` : entry
      const abs = resolve(dir, entry)
      if (statSync(abs).isDirectory()) walk(abs, rel)
      else if (entry.endsWith('.mjs')) out.push(rel)
    }
  }
  walk(distDir)
  return out
}

describe.skipIf(!distExists)('dist node built-in imports (#387)', () => {
  it('audit chunk does not reference node:crypto', () => {
    const auditFile = listDistFiles().find(f => f.includes('audit') && f.endsWith('.mjs') && !f.includes('plugin'))
    expect(auditFile, 'expected a built audit chunk').toBeDefined()
    expect(readDist(auditFile!)).not.toContain('node:crypto')
  })

  it('catalog entry does not reference node: built-ins or pretty-error-snippet.node', () => {
    const source = readDist('catalog.mjs')
    expect(source).not.toMatch(/node:(crypto|fs|path|module)/)
    expect(source).not.toContain('pretty-error-snippet.node')
  })

  it('index entry does not reference pretty-error-snippet.node', () => {
    const source = readDist('index.mjs')
    expect(source).not.toContain('pretty-error-snippet.node')
  })
})
