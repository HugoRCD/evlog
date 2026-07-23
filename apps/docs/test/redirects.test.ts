import { readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { rawRedirects, redirects } from '../config/redirects'

const contentDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'content')

/** Strips Nuxt Content's ordering prefix (`0.`, `01.`, `16.`, ...) from a path segment. */
function stripOrderPrefix(segment: string): string {
  return segment.replace(/^\d+\./, '')
}

/**
 * Walks `content/` and returns every URL path Nuxt Content will generate, mirroring the
 * same prefix-stripping Nuxt Content applies to file and directory names. Used to catch
 * redirect targets that point at content which doesn't (or no longer) exists.
 */
function collectContentPaths(dir: string, base = ''): Set<string> {
  const paths = new Set<string>()

  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.'))
      continue

    const fullPath = join(dir, entry)

    if (statSync(fullPath).isDirectory()) {
      for (const path of collectContentPaths(fullPath, `${base}/${stripOrderPrefix(entry)}`))
        paths.add(path)
      continue
    }

    if (!entry.endsWith('.md'))
      continue

    const name = stripOrderPrefix(entry.replace(/\.md$/, ''))
    paths.add(name === 'landing' ? '/' : `${base}/${name}`)
  }

  return paths
}

const contentPaths = collectContentPaths(contentDir)

/** Strips a `#hash` fragment — raw markdown mirrors and content-path lookups have no anchors. */
function withoutHash(path: string): string {
  return path.split('#')[0]
}

describe('docs redirects', () => {
  it('every redirect target resolves to an existing content page', () => {
    const broken = Object.entries(redirects)
      .filter(([, entry]) => !contentPaths.has(withoutHash(entry.redirect.to)))
      .map(([from, entry]) => `${from} -> ${entry.redirect.to}`)

    expect(broken).toEqual([])
  })

  it('every raw markdown mirror redirect resolves to an existing content page', () => {
    const broken = Object.entries(rawRedirects)
      .filter(([, entry]) => !contentPaths.has(entry.redirect.to.replace(/^\/raw/, '').replace(/\.md$/, '')))
      .map(([from, entry]) => `${from} -> ${entry.redirect.to}`)

    expect(broken).toEqual([])
  })

  it('has no raw mirror for anchored redirects (anchors don\'t exist in raw markdown)', () => {
    for (const from of Object.keys(redirects).filter(k => redirects[k].redirect.to.includes('#')))
      expect(rawRedirects).not.toHaveProperty(`/raw${from}.md`)
  })

  // Regression guard: these all 404'd live on evlog.dev before redirects were added —
  // every "new" section root that only has child pages, not its own content file.
  it.each([
    '/start',
    '/learn',
    '/integrate',
    '/reference',
    '/examples',
    '/adapters/cloud',
    '/adapters/self-hosted',
    '/use-cases/audit',
  ])('redirects the bare section root %s', (path) => {
    expect(redirects).toHaveProperty(path)
  })
})
