import { getRequestURL, sendRedirect } from 'h3'

/**
 * When zeroRuntime is enabled, nuxt-og-image throws at runtime if a static OG
 * asset was not prerendered. Requests that reach this middleware have already
 * missed the CDN static file — redirect to the site-wide fallback image.
 */
export default defineEventHandler((event) => {
  if (import.meta.dev) {
    return
  }

  const { pathname } = getRequestURL(event)

  if (!pathname.startsWith('/_og/s/')) {
    return
  }

  return sendRedirect(event, '/og.png', 302)
})
