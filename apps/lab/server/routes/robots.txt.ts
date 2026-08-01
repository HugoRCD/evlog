/**
 * Served rather than dropped in `public/`, so the sitemap URL comes from the
 * same config as the canonical instead of being a second copy of the origin
 * that can drift from it.
 */
export default defineEventHandler((event) => {
  const { siteUrl } = useRuntimeConfig(event).public

  setHeader(event, 'content-type', 'text/plain; charset=utf-8')

  return [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
  ].join('\n')
})
