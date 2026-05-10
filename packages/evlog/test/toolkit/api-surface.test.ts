import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import pkg from '../../package.json' with { type: 'json' }

const distDir = join(dirname(fileURLToPath(import.meta.url)), '../../dist')
const distExists = existsSync(join(distDir, 'index.mjs'))

if (!distExists) {
  console.warn('[evlog test] Skipping public API surface snapshot: dist/ not found. Run `pnpm --filter evlog run build` first.')
}

type Exports = Record<string, { import?: string, default?: string } | string>

/**
 * Snapshot the *public* JS surface (named exports) of every subpath listed in
 * `package.json#exports`. A regression here means a breaking-or-renaming
 * change ships to consumers — review the snapshot diff before approving.
 *
 * Intentionally ignores types-only changes (those are checked by `tsc`).
 * Skipped on environments where `dist/` is not built (matches
 * `worker-preset-dist-imports.test.ts`).
 */
describe.skipIf(!distExists)('public API surface', () => {
  it('matches snapshot for all subpath exports', async () => {
    const exportsField = pkg.exports as Exports
    const subpaths = Object.keys(exportsField).sort()

    const surfaces: Record<string, string[]> = {}
    for (const sub of subpaths) {
      const entry = exportsField[sub]
      if (!entry || typeof entry === 'string') continue
      const importPath = entry.import || entry.default
      if (!importPath) continue

      const absolute = resolve(dirname(fileURLToPath(import.meta.url)), '../..', importPath)
      const url = pathToFileURL(absolute).href
      const mod = await import(url)
      surfaces[sub] = Object.keys(mod).filter(k => k !== 'default').sort()
    }

    expect(surfaces).toMatchSnapshot()
  })
})
