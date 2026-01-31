import { definePlugin } from 'nitro'
import { useRuntimeConfig } from 'nitro/runtime-config'
import type { CaptureError } from 'nitro/types'
import type { HTTPEvent } from 'nitro/h3'
import { parseURL } from 'ufo'
import { createRequestLogger, initLogger } from '../logger'
import { shouldLog } from '../nitro'
import type { RequestLogger } from '../types'

export * from './error'

interface EvlogConfig {
  env?: Record<string, unknown>
  pretty?: boolean
  include?: string[]
}

// currently nitro/v3 doesnt export hook types correctly
// https://github.com/nitrojs/nitro/blob/8882bc9e1dbf2d342e73097f22a2156f70f50575/src/types/runtime/nitro.ts#L48-L53
interface NitroRuntimeHooks {
  close: () => void;
  error: CaptureError;
  request: (event: HTTPEvent) => void | Promise<void>;
  response: (res: Response, event: HTTPEvent) => void | Promise<void>;
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
  })
  
  hooks.hook('response', (res, event) => {
    const e = event
    const log = e.req.context?.log as RequestLogger | undefined
    if (log) {
      log.set({ status: res.status })
      log.emit()
    }
  })
  
  hooks.hook('error', (error, { event }) => {
    const e = event
    const log = e?.req.context?.log as RequestLogger | undefined
    if (log) {
      log.error(error as Error)
    }
  })
})
