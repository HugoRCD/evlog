/**
 * Extend drain lifetime on serverless runtimes without blocking the HTTP response.
 * When `waitUntil` is omitted, callers should await `drainPromise` themselves.
 */
export function extendDeferredDrain(
  drainPromise: Promise<unknown>,
  waitUntil?: (promise: Promise<unknown>) => void,
): void {
  void drainPromise.catch((err) => {
    console.error('[evlog] background drain failed:', err)
  })
  if (typeof waitUntil === 'function') {
    waitUntil(drainPromise)
  }
}
