/**
 * Browsers phrase a failed dynamic `import()` differently. These are the
 * messages PostHog recorded for stale `/_nuxt/*.js` after a docs deploy.
 */
const CHUNK_LOAD_MARKERS = [
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
] as const

function messageOf(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return ''
}

/** True when `error` is a failed dynamic import, usually a stale hashed chunk. */
export function isChunkLoadError(error: unknown): boolean {
  const message = messageOf(error)
  return CHUNK_LOAD_MARKERS.some(marker => message.includes(marker))
}
