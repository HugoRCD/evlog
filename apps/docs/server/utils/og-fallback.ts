/**
 * Whether a request should be redirected to the site-wide fallback OG image.
 *
 * Prerender must be excluded: nuxt-og-image generates each asset by fetching its
 * own `/_og/s/*` route, so redirecting there makes Nitro write a meta-refresh
 * `.png.html` stub to the static output instead of the PNG.
 */
export function shouldFallbackToStaticOgImage(
  path: string,
  { dev, prerender }: { dev: boolean, prerender: boolean },
): boolean {
  if (dev || prerender) {
    return false
  }

  const [pathname] = path.split('?')

  return pathname.startsWith('/_og/s/')
}
