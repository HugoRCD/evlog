import type { EvlogEveOptions } from 'evlog/eve'
import type { TailSamplingContext } from 'evlog'
import { resolveDrain, type AdapterConfig } from './adapters'

export interface ExtensionConfig {
  service?: string
  adapter: AdapterConfig | AdapterConfig[]
  message: 'omit' | 'preview' | 'full'
  messagePreviewLength?: number
  redact: boolean | { paths: string[] }
  sample?: number
  keepOnFailure: boolean
  sessionEvent: boolean
  batch?: { size: number, intervalMs: number }
}

/** Turn outcomes worth keeping whatever the sampling rate says. */
function isNotableTurn(ctx: TailSamplingContext): boolean {
  const status = ctx.status ?? 200
  if (status >= 400 && status !== 499) return true

  const eve = ctx.context.eve as {
    phase?: string
    authorizations?: Array<{ outcome?: string }>
    stepFailures?: unknown[]
  } | undefined
  if (!eve) return false

  if (eve.phase === 'rejected' || eve.phase === 'failed') return true
  if (eve.stepFailures?.length) return true
  return eve.authorizations?.some(a => a.outcome && a.outcome !== 'authorized') ?? false
}

/**
 * Translate the declarative mount config into the options `defineEvlogHook`
 * takes. `sample` is head sampling — the only place a turn can actually be
 * dropped — while `keepOnFailure` is tail sampling, which can force a turn back
 * in but never drop one.
 */
export function toHookOptions(config: ExtensionConfig, agentName: string): EvlogEveOptions {
  const sampleRate = config.sample === undefined ? undefined : Math.round(config.sample * 100)

  return {
    init: {
      env: { service: config.service ?? agentName },
      ...(sampleRate !== undefined ? { sampling: { rates: { info: sampleRate } } } : {}),
    },
    drain: resolveDrain({ adapter: config.adapter, batch: config.batch }),
    redact: typeof config.redact === 'boolean' ? config.redact : { paths: config.redact.paths },
    message: config.message,
    ...(config.messagePreviewLength !== undefined
      ? { messagePreviewLength: config.messagePreviewLength }
      : {}),
    sessionEvent: config.sessionEvent,
    ...(config.keepOnFailure
      ? {
        keep: (ctx: TailSamplingContext) => {
          if (isNotableTurn(ctx)) ctx.shouldKeep = true
        },
      }
      : {}),
  }
}
