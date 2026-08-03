import { sendRedirect, setResponseHeader } from 'h3'
import { shouldFallbackToStaticOgImage } from '../utils/og-fallback'

/**
 * When zeroRuntime is enabled, nuxt-og-image throws at runtime if a static OG
 * asset was not prerendered. Requests that reach this middleware have already
 * missed the CDN static file — redirect to the site-wide fallback image.
 */
export default defineEventHandler((event) => {
  if (!shouldFallbackToStaticOgImage(event.path, {
    dev: import.meta.dev,
    prerender: import.meta.prerender,
  })) {
    return
  }

  // Do not inherit immutable cache from routeRules — this redirect must not
  // stick after a later deploy prerenders the real per-page OG asset.
  setResponseHeader(event, 'cache-control', 'no-store')
  return sendRedirect(event, '/og.png', 302)
})
