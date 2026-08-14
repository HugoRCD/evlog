import type { SessionContext } from 'eve/context'

/**
 * Opens the session's sandbox without waiting for it.
 *
 * eve memoizes the sandbox handle per session, so the first `glob` or `bash`
 * awaits this same in-flight open instead of starting its own. Left lazy, the
 * snapshot restore and `onSession` land inside whichever file tool the model
 * happens to reach for first, which is why a `glob` reads as a five-minute
 * hang; started here, they overlap the turn's first model call.
 *
 * A failure is logged and dropped: a throwing hook surfaces as `turn.failed`,
 * and the tool that actually needs the sandbox opens it again and reports its
 * own error.
 */
export function prewarmSandbox(ctx: Pick<SessionContext, 'getSandbox'>): void {
  void ctx.getSandbox().catch((error: unknown) => {
    console.error('[evi:sandbox] prewarm failed', error)
  })
}
