/**
 * `experimental.emitRouteChunkError: 'automatic-immediate'` already reloads
 * when Nuxt sees `app:chunkError` (the `vite:preloadError` path). Firefox and
 * Safari often surface the same stale `/_nuxt` import as an unhandled
 * rejection instead, which never reaches that hook and leaves the page
 * broken. Recover those the same way Nuxt recovers route-chunk failures.
 */
export default defineNuxtPlugin(() => {
  if (import.meta.dev) return

  const recover = (error: unknown) => {
    if (!isChunkLoadError(error)) return
    reloadNuxtApp({ persistState: true })
  }

  window.addEventListener('unhandledrejection', (event) => {
    recover(event.reason)
  })
})
