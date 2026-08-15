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

  it('reads lastmod from the commit date of the page stem', () => {
    const pages = [{ path: '/learn/overview', stem: '2.learn/0.overview' }]

    const dates = { '2.learn/0.overview': '2026-04-16' }

    expect(collectSitemapUrls(pages, dates)).toEqual([{ loc: '/learn/overview', lastmod: '2026-04-16' }])
  })

  it('omits lastmod for pages with no commit date', () => {
    const pages = [{ path: '/a', stem: 'untracked' }, { path: '/b' }]

    expect(collectSitemapUrls(pages, { other: '2026-04-16' })).toEqual([{ loc: '/a' }, { loc: '/b' }])
  })
})
