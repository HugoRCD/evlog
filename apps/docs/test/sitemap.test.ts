import { describe, expect, it } from 'vitest'
import { collectSitemapUrls } from '../server/utils/sitemap'

describe('collectSitemapUrls', () => {
  it('maps content paths to sitemap entries', () => {
    expect(collectSitemapUrls([{ path: '/learn/wide-events' }])).toEqual([{ loc: '/learn/wide-events' }])
  })

  it('rewrites the landing content path to the home page', () => {
    expect(collectSitemapUrls([{ path: '/landing' }])).toEqual([{ loc: '/' }])
  })

  it('excludes pages opting out through frontmatter', () => {
    const pages = [
      { path: '/public' },
      { path: '/private', meta: { sitemap: false } },
    ]

    expect(collectSitemapUrls(pages)).toEqual([{ loc: '/public' }])
  })

  it('excludes navigation configuration files', () => {
    const pages = [
      { path: '/learn/.navigation' },
      { path: '/.navigation' },
      { path: '/learn/overview' },
    ]

    expect(collectSitemapUrls(pages)).toEqual([{ loc: '/learn/overview' }])
  })

  it('deduplicates repeated paths', () => {
    const pages = [{ path: '/landing' }, { path: '/' }]

    expect(collectSitemapUrls(pages)).toEqual([{ loc: '/' }])
  })

  it('reads lastmod from frontmatter and keeps the date part', () => {
    const pages = [{ path: '/learn/overview', meta: { modifiedAt: '2026-04-16T12:30:00.000Z' } }]

    expect(collectSitemapUrls(pages)).toEqual([{ loc: '/learn/overview', lastmod: '2026-04-16' }])
  })

  it('omits lastmod when modifiedAt is absent or not a string', () => {
    const pages = [
      { path: '/a' },
      { path: '/b', meta: { modifiedAt: 1_745_000_000 } },
    ]

    expect(collectSitemapUrls(pages)).toEqual([{ loc: '/a' }, { loc: '/b' }])
  })
})
