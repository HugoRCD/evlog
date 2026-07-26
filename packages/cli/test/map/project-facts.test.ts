import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectProjectFacts } from '../../src/lib/map/project-facts'
import type { ProjectFacts } from '../../src/lib/map/project-facts'
import type { ScanContext } from '../../src/lib/map/types'

const tempDirs: string[] = []

async function factsFor(files: Record<string, string>): Promise<ProjectFacts> {
  const root = await mkdtemp(join(tmpdir(), 'evlog-cli-project-facts-'))
  tempDirs.push(root)
  for (const [path, source] of Object.entries(files)) {
    const file = join(root, path)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, source, 'utf8')
  }

  const ctx: ScanContext = {
    projectRoot: root,
    framework: 'nuxt',
    projectName: 'temp',
    hasEvlog: true,
    verbose: false,
  }
  return collectProjectFacts(ctx, { packageJson: { dependencies: { evlog: '*' } } })
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('collectProjectFacts', () => {
  it.each(['ts', 'mts', 'cts', 'mjs'])('sees a catalog declared in a .%s module', async (ext) => {
    const facts = await factsFor({
      [`shared/errors.${ext}`]: 'import { defineErrorCatalog } from \'evlog\'\nexport const errors = defineErrorCatalog(\'shop\', {})',
    })

    expect(facts.features.has('error-catalog')).toBe(true)
    expect(facts.catalogs).toContain('shop')
  })

  it('ignores build output rather than reading a stale copy of the source', async () => {
    const facts = await factsFor({
      'dist/errors.js': 'import { defineErrorCatalog } from \'evlog\'\nexport const errors = defineErrorCatalog(\'stale\', {})',
      '.nuxt/errors.mjs': 'import { defineErrorCatalog } from \'evlog\'\nexport const errors = defineErrorCatalog(\'generated\', {})',
    })

    expect(facts.catalogs).toEqual([])
  })
})
