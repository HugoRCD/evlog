/**
 * One route, so this is hand-rolled rather than a sitemap module: the app is a
 * single client-rendered tool, and everything past `/` is state in a share link
 * — an infinite space of URLs that means nothing to a crawler.
 *
 * No `lastmod`: a build timestamp changes on every deployment whether or not
 * the page did, and a crawler that learns the date is meaningless starts
 * ignoring it.
 */
export default defineEventHandler((event) => {
  const { siteUrl } = useRuntimeConfig(event).public

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`
})
