import { useLogger } from 'evlog/eve'
import type { SessionContext } from 'eve/context'

/** What `prewarmSandbox` needs from a hook context, and nothing more. */
type PrewarmContext = Pick<SessionContext, 'getSandbox'> & {
  readonly session: { readonly id: string }
}

/**
 * Records the open on the turn's wide event as `sandbox.openMs`. An open that
 * outlives its turn is dropped rather than attached to a later one, because
 * `useLogger` throws once the turn is over.
 */
function recordOpen(ctx: PrewarmContext, openMs: number): void {
  try {
    useLogger(ctx).set({ sandbox: { openMs } })
  } catch {
    console.info('[evi:sandbox] opened in %dms, after its turn ended', openMs)
  }
}

/**
 * Opens the session's sandbox without waiting for it. eve memoizes the handle
 * per session, so the first file tool awaits this open instead of starting its
 * own. A rejected open is logged and swallowed: throwing here would fail the
 * turn, and the tool that needs the sandbox opens it again and reports it.
 */
export function prewarmSandbox(ctx: PrewarmContext): void {
  const startedAt = Date.now()
  void ctx.getSandbox().then(
    () => recordOpen(ctx, Date.now() - startedAt),
    (error: unknown) => console.error('[evi:sandbox] prewarm failed', error),
  )
}
