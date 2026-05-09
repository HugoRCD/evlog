import type { ServerResponse } from 'node:http'
import type { RequestLogger } from '../types'
import type { MiddlewareLoggerResult } from './middleware'

/**
 * Bind an evlog middleware {@link MiddlewareLoggerResult.finish | `finish()`}
 * to a Node {@link ServerResponse} lifecycle.
 *
 * Listens to **both** `finish` (response fully transmitted) and `close`
 * (underlying socket closed — including client disconnects mid-response).
 * Idempotent: only the first event to fire calls `finish()`.
 *
 * When `close` fires before `finish`, the client disconnected before the
 * response could complete. In that case the wide event is marked with
 * `connectionClosed: true` so disconnects are observable in the drain.
 *
 * @remarks
 * For background work that must outlive the HTTP response (e.g. resumable
 * streams, post-response usage accounting), use
 * {@link RequestLogger.fork | `req.log.fork(label, fn)`} instead of mutating
 * the request logger after the response has closed — once `finish()` has run,
 * the request logger is sealed.
 *
 * @internal Used by the Express and NestJS integrations.
 */
export function bindNodeResponseLifecycle(
  res: ServerResponse,
  logger: RequestLogger,
  finish: MiddlewareLoggerResult['finish'],
): void {
  let settled = false

  const onFinish = (): void => {
    if (settled) return
    settled = true
    finish({ status: res.statusCode }).catch(() => {})
  }

  const onClose = (): void => {
    if (settled) return
    settled = true
    logger.set({ connectionClosed: true })
    finish({ status: res.statusCode }).catch(() => {})
  }

  res.once('finish', onFinish)
  res.once('close', onClose)
}
