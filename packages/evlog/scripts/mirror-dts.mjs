/**
 * Mirror every `*.d.mts` to `*.d.ts` so extensionless imports resolve.
 *
 * Nuxt/Nitro auto-import type generation resolves `typeFrom` to a filesystem
 * path then strips the extension (`dist/index.d.mts` → `dist/index`). TypeScript
 * bundler resolution does not pick up `.d.mts` for extensionless paths, so
 * `typeof import('.../dist/index').useLogger` becomes `any`. A sibling `.d.ts`
 * restores correct types for those generated declarations (#407).
 */
import { copyFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const distDir = fileURLToPath(new URL('../dist', import.meta.url))

async function mirror(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      await mirror(path)
      return
    }
    if (entry.name.endsWith('.d.mts')) {
      await copyFile(path, path.replace(/\.d\.mts$/, '.d.ts'))
    }
  }))
}

await mirror(distDir)
