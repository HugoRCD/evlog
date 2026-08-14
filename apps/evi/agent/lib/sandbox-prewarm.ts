import { useLogger } from 'evlog/eve'
import type { SessionContext } from 'eve/context'

/** What `prewarmSandbox` needs from a hook context, and nothing more. */
type PrewarmContext = Pick<SessionContext, 'getSandbox'> & {
  readonly session: { readonly id: string }
}

/**
 * Records how long the open took on the turn's wide event, as
 * `sandbox.openMs`. Nothing else measures it: eve opens the sandbox inside
 * whichever tool call happens to need it first, so the wait is reported as
 * that tool's duration and a resume is indistinguishable from a rebuild.
 *
 * A slow open outlives its own turn, and `useLogger` throws once the turn is
 * over. That sample is dropped rather than reattached to a later turn, which
 * would misattribute it.
 */
function recordOpen(ctx: PrewarmContext, openMs: number): void {
  try {
    useLogger(ctx).set({ sandbox: { openMs } })
  }
  catch {
    console.info('[evi:sandbox] opened in %dms, after its turn ended', openMs)
  }
}

/**
 * Opens the session's sandbox without waiting for it.
 *
 * eve memoizes the sandbox handle per session, so the first `glob` or `bash`
 * awaits this same in-flight open instead of starting its own. Left lazy, the
 * snapshot restore and `onSession` land inside whichever file tool the model
 * happens to reach for first; started here, they overlap the turn's first
 * model call.
 *
 * A failure is logged and dropped: a throwing hook surfaces as `turn.failed`,
 * and the tool that actually needs the sandbox opens it again and reports its
 * own error.
 */
export function prewarmSandbox(ctx: PrewarmContext): void {
  const startedAt = Date.now()
  void ctx.getSandbox().then(
    () => recordOpen(ctx, Date.now() - startedAt),
    (error: unknown) => console.error('[evi:sandbox] prewarm failed', error),
  )
}
