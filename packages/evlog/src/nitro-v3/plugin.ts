import { definePlugin } from 'nitro'
import { useRuntimeConfig } from 'nitro/runtime-config'
import type { CaptureError } from 'nitro/types'
import type { HTTPEvent } from 'nitro/h3'
import { parseURL } from 'ufo'
import { createRequestLogger, initLogger } from '../logger'
import { shouldLog } from '../nitro'
import type { RequestLogger, SamplingConfig, TailSamplingContext, WideEvent } from '../types'

export * from './error'

interface EvlogConfig {
  env?: Record<string, unknown>
  pretty?: boolean
  include?: string[]
  sampling?: SamplingConfig
}

// currently nitro/v3 doesnt export hook types correctly
// https://github.com/nitrojs/nitro/blob/8882bc9e1dbf2d342e73097f22a2156f70f50575/src/types/runtime/nitro.ts#L48-L53
interface NitroRuntimeHooks {
  close: () => void;
  error: CaptureError;
  request: (event: HTTPEvent) => void | Promise<void>;
  response: (res: Response, event: HTTPEvent) => void | Promise<void>;
  'evlog:emit:keep': (ctx: TailSamplingContext) => void | Promise<void>;
  'evlog:drain': (ctx: { event: WideEvent; request?: { method?: string; path: string; requestId?: string } }) => void | Promise<void>;
}
// Hookable core type not available so we build it our self
type Hooks = {
    hook: <THookName extends keyof NitroRuntimeHooks>(
        name: THookName,
        listener: NitroRuntimeHooks[THookName]
    ) => void;
}

export default definePlugin((nitroApp) => {
  const config = useRuntimeConfig()
  const evlogConfig = config.evlog as EvlogConfig | undefined

  initLogger({
    env: evlogConfig?.env,
    pretty: evlogConfig?.pretty,
    sampling: evlogConfig?.sampling,
  })

  const hooks = nitroApp.hooks as Hooks


  hooks.hook('request', (event) => {
    const e = event

    const { method } = e.req
    const requestId = e.req.context?.requestId as string | undefined ?? crypto.randomUUID()

    const {
      pathname
    } = parseURL(e.req.url)
  
    // Skip logging for routes not matching include patterns
    if (!shouldLog(pathname, evlogConfig?.include)) {
      return
    }
  
    const log = createRequestLogger({
      method: method,
      path: pathname,
      requestId,
    })
    if (!e.req.context) {
      e.req.context = {}
    }
    e.req.context.log = log
    // Store start time for duration calculation in tail sampling
    e.req.context._evlogStartTime = Date.now()
  })
  
  hooks.hook('response', async (res, event) => {
    const e = event
    // Skip if already emitted by error hook
    if (e.req.context?._evlogEmitted) return

    const log = e.req.context?.log as RequestLogger | undefined
    if (log && e.req.context) {
      const { status } = res
      log.set({ status })

      const { pathname } = parseURL(e.req.url)
      const startTime = e.req.context._evlogStartTime as number | undefined
      const durationMs = startTime ? Date.now() - startTime : undefined

      const tailCtx: TailSamplingContext = {
        status,
        duration: durationMs,
        path: pathname,
        method: e.req.method,
        context: log.getContext(),
        shouldKeep: false,
      }

      await nitroApp.hooks.callHook('evlog:emit:keep', tailCtx)

      const emittedEvent = log.emit({ _forceKeep: tailCtx.shouldKeep })

      // Drain hook integration
      if (emittedEvent) {
        try {
          await nitroApp.hooks.callHook('evlog:drain', {
            event: emittedEvent,
            request: { method: e.req.method, path: pathname, requestId: e.req.context.requestId as string | undefined },
          })
        } catch (err) {
          console.error('[evlog] drain failed:', err)
        }
      }
    }
  })
  
  hooks.hook('error', async (error, { event }) => {
    const e = event
    if (!e) return

    const log = e.req.context?.log as RequestLogger | undefined
    if (log && e.req.context) {
      log.error(error as Error)

      // Get the actual error status code
      const errorStatus = (error as { statusCode?: number }).statusCode ?? 500
      log.set({ status: errorStatus })

      const { pathname } = parseURL(e.req.url)
      const startTime = e.req.context._evlogStartTime as number | undefined
      const durationMs = startTime ? Date.now() - startTime : undefined

      const tailCtx: TailSamplingContext = {
        status: errorStatus,
        duration: durationMs,
        path: pathname,
        method: e.req.method,
        context: log.getContext(),
        shouldKeep: false,
      }

      await nitroApp.hooks.callHook('evlog:emit:keep', tailCtx)

      e.req.context._evlogEmitted = true

      const emittedEvent = log.emit({ _forceKeep: tailCtx.shouldKeep })

      // Drain hook integration
      if (emittedEvent) {
        try {
          await nitroApp.hooks.callHook('evlog:drain', {
            event: emittedEvent,
            request: { method: e.req.method, path: pathname, requestId: e.req.context.requestId as string | undefined },
          })
        } catch (err) {
          console.error('[evlog] drain failed:', err)
        }
      }
    }
  })
})
