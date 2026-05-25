import { defineEventHandler, setResponseHeader } from 'h3'
import { queryCollection } from '@nuxt/content/server'
import { withHttps } from 'ufo'

interface SitemapUrl {
  loc: string
  lastmod?: string
}

/**
 * Overrides the default Docus sitemap (`node_modules/docus/server/routes/sitemap.xml.ts`).
 *
 * Two reasons we ship our own:
 * 1. Docus unconditionally queries the `landing` collection. Since this app provides its
 *    own `app/pages/index.vue`, that collection is not registered, so the request to
 *    `/__nuxt_content/landing/query` 404s and Nitro logs it as `[fatal]` during build.
 * 2. The home page lives at `/` but is sourced from `content/0.landing.md` (path
 *    `/landing` in the docs collection). Docus's sitemap therefore lists `/landing`,
 *    pointing at a URL that does not match any prerendered page. We rewrite it to `/`.
 */
export default defineEventHandler(async (event) => {
  const siteUrl = inferSiteURL() || ''

  const urls: SitemapUrl[] = []
  const seen = new Set<string>()

  try {
    const pages = await queryCollection(event, 'docs').all()

    for (const page of pages) {
      let pagePath = page.path || '/'

      if (page.sitemap === false) continue
      if (pagePath.endsWith('.navigation') || pagePath.includes('/.navigation')) continue

      if (pagePath === '/landing') pagePath = '/'

      if (seen.has(pagePath)) continue
      seen.add(pagePath)

      const urlEntry: SitemapUrl = { loc: pagePath }

      if (page.modifiedAt && typeof page.modifiedAt === 'string') {
        const [datePart] = page.modifiedAt.split('T')
        urlEntry.lastmod = datePart
      }

      urls.push(urlEntry)
    }
  } catch {
    // Collection might not exist, skip silently.
  }

  setResponseHeader(event, 'content-type', 'application/xml')
  return generateSitemap(urls, siteUrl)
})

function inferSiteURL() {
  const url
    = process.env.NUXT_PUBLIC_SITE_URL
      || process.env.NUXT_SITE_URL
      || process.env.VERCEL_PROJECT_PRODUCTION_URL
      || process.env.VERCEL_BRANCH_URL
      || process.env.VERCEL_URL
      || process.env.URL
      || process.env.CI_PAGES_URL
      || process.env.CF_PAGES_URL

  return url ? withHttps(url) : undefined
}

function generateSitemap(urls: SitemapUrl[], siteUrl: string): string {
  const urlEntries = urls
    .map((url) => {
      const loc = siteUrl ? `${siteUrl}${url.loc}` : url.loc
      let entry = `  <url>\n    <loc>${escapeXml(loc)}</loc>`
      if (url.lastmod) {
        entry += `\n    <lastmod>${escapeXml(url.lastmod)}</lastmod>`
      }
      entry += `\n  </url>`
      return entry
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
