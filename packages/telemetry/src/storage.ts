import { AsyncLocalStorage } from 'node:async_hooks'
import type { RunContext } from './types'

const storage = new AsyncLocalStorage<RunContext>()

/** @internal Enter a telemetry run scope (sync or async). */
export function runWithContext<T>(ctx: RunContext, fn: () => T): T {
  return storage.run(ctx, fn)
}

/** @internal Read the active run context, if any. */
export function getRunContext(): RunContext | undefined {
  return storage.getStore()
}
