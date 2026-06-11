/** @internal Extend drain lifetime on Cloudflare without blocking Nitro Node responses. */
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
