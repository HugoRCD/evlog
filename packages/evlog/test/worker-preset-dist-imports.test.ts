import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const distDir = join(dirname(fileURLToPath(import.meta.url)), '../dist')

async function collectMjsFiles(dir: string, out: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) await collectMjsFiles(p, out)
    else if (e.isFile() && e.name.endsWith('.mjs') && !e.name.endsWith('.map')) out.push(p)
  }
  return out
}

describe('published dist avoids static nitro virtual imports', () => {
  it('no .mjs file contains a resolvable nitro/runtime-config module specifier', async () => {
    const files = await collectMjsFiles(distDir)
    expect(files.length).toBeGreaterThan(0)

    const forbidden = [
      '"nitro/runtime-config"',
      '\'nitro/runtime-config\'',
      '`nitro/runtime-config`',
    ]

    for (const file of files) {
      const src = await readFile(file, 'utf8')
      for (const needle of forbidden) {
        expect(src, file).not.toContain(needle)
      }
    }
  })
})
