interface SitemapPage {
  path?: string
  stem?: string
  meta?: Record<string, unknown>
}

export interface SitemapUrl {
  loc: string
  lastmod?: string
}

/**
 * Frontmatter keys outside a collection's schema land in `page.meta`, not on the page
 * itself — reading `page.sitemap` silently never matches, so an excluded page would
 * still ship in the sitemap.
 */
export function collectSitemapUrls(
  pages: SitemapPage[],
  commitDates: Record<string, string> = {},
): SitemapUrl[] {
  const urls: SitemapUrl[] = []
  const seen = new Set<string>()

  for (const page of pages) {
    const meta = page.meta ?? {}
    let pagePath = page.path || '/'

    if (meta.sitemap === false) continue
    if (pagePath.endsWith('.navigation') || pagePath.includes('/.navigation')) continue

    // The home page renders at `/` from `content/0.landing.md`, whose content path is `/landing`.
    if (pagePath === '/landing') pagePath = '/'

    if (seen.has(pagePath)) continue
    seen.add(pagePath)

    const urlEntry: SitemapUrl = { loc: pagePath }

    const lastmod = page.stem ? commitDates[page.stem] : undefined
    if (lastmod) urlEntry.lastmod = lastmod

    urls.push(urlEntry)
  }

  return urls
}
