import { getHeaders } from 'h3'
import type { NitroApp } from 'nitropack/types'
import { createRequestLogger, getGlobalPluginRunner } from '../logger'
import { useLogger } from '../runtime/server/useLogger'
import type { DrainContext, EnrichContext, FieldContext, RequestLogger, ServerEvent, WideEvent } from '../types'
import { filterSafeHeaders } from '../utils'
import type { AILogger, AILoggerOptions } from './index'
import { createAILogger } from './index'

export type NitroAIStreamFields<T extends object = Record<string, unknown>> = FieldContext<T> & {
  _forceKeep?: boolean
}

export interface NitroAIStreamLoggerOptions<T extends object = Record<string, unknown>> {
  /**
   * Operation label stored on the child wide event.
   * @default 'ai-stream'
   */
  operation?: string
  /**
   * Initial fields added to the child wide event.
   */
  fields?: FieldContext<T>
  /**
   * Options passed to `createAILogger()`.
   */
  ai?: AILoggerOptions
}

export interface NitroAIStreamLogger<T extends object = Record<string, unknown>> {
  /** AI SDK logger bound to the child stream event. */
  ai: AILogger
  /** Child request logger for custom stream metadata. */
  log: RequestLogger<T>
  /**
   * Emit the child AI stream event through Nitro enrich/drain hooks.
   *
   * Idempotent: later calls return `null` without warning.
   */
  emit: (fields?: NitroAIStreamFields<T>) => Promise<WideEvent | null>
  /**
   * Return a new response with the same status, status text, headers, and
   * streamed body. The child event emits when the body closes or errors.
   */
  wrapResponse: (response: Response, fields?: NitroAIStreamFields<T>) => Response
}

interface ResponseMeta {
  status?: number
  headers?: Record<string, string>
}

interface WaitUntilHost {
  waitUntil?: (promise: Promise<unknown>) => void
}

function getSafeRequestHeaders(event: ServerEvent): Record<string, string> {
  const headers = getHeaders(event as Parameters<typeof getHeaders>[0])
  return filterSafeHeaders(headers)
}

function getSafeResponseHeaders(response: Response): Record<string, string> | undefined {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })
  if (Object.keys(headers).length === 0) return undefined
  return filterSafeHeaders(headers)
}

function resolveWaitUntil(event: ServerEvent): WaitUntilHost | undefined {
  return event.context.cloudflare?.context ?? event.context
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

function splitEmitFields<T extends object>(fields?: NitroAIStreamFields<T>): {
  context?: FieldContext<T>
  forceKeep: boolean
} {
  if (!fields) return { forceKeep: false }
  const { _forceKeep, ...context } = fields
  return {
    context: context as FieldContext<T>,
    forceKeep: _forceKeep === true,
  }
}

async function enrichAndDrainNitroEvent(
  event: ServerEvent,
  emittedEvent: WideEvent,
  meta: ResponseMeta,
): Promise<void> {
  const nitroApp = await getNitroApp()
  const runner = getGlobalPluginRunner()
  const request = {
    method: event.method,
    path: event.path,
    requestId: typeof emittedEvent.requestId === 'string' ? emittedEvent.requestId : undefined,
  }
  const headers = getSafeRequestHeaders(event)
  const hookContext = {
    request,
    headers,
    response: {
      status: meta.status,
      headers: meta.headers,
    },
  }
  const enrichCtx: EnrichContext = { event: emittedEvent, ...hookContext }

  try {
    await nitroApp.hooks.callHook('evlog:enrich', enrichCtx)
  } catch (err) {
    console.error('[evlog] enrich failed:', err)
  }
  if (runner.hasEnrich) {
    await runner.runEnrich(enrichCtx)
  }

  const drainCtx: DrainContext = {
    event: emittedEvent,
    request,
    headers,
  }
  const drainTasks: Array<Promise<unknown>> = []

  try {
    drainTasks.push(
      nitroApp.hooks.callHook('evlog:drain', drainCtx).catch((err: unknown) => {
        console.error('[evlog] drain failed:', err)
      }),
    )
  } catch (err) {
    console.error('[evlog] drain failed:', err)
  }
  if (runner.hasDrain) {
    drainTasks.push(runner.runDrain(drainCtx))
  }

  if (drainTasks.length === 0) return
  const drainPromise = Promise.all(drainTasks)
  const waitUntil = resolveWaitUntil(event)
  if (typeof waitUntil?.waitUntil === 'function') {
    waitUntil.waitUntil(drainPromise)
  } else {
    await drainPromise
  }
}

async function getNitroApp(): Promise<NitroApp> {
  const { useNitroApp } = await import('nitropack/runtime')
  return useNitroApp()
}

function createObservedBody(
  body: ReadableStream<Uint8Array>,
  onDone: () => Promise<void>,
  onError: (error: unknown) => Promise<void>,
): ReadableStream<Uint8Array> {
  const reader = body.getReader()

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          await onDone()
          controller.close()
          return
        }
        controller.enqueue(value)
      } catch (err) {
        await onError(err)
        controller.error(err)
      }
    },

    async cancel(reason) {
      try {
        await reader.cancel(reason)
      } finally {
        await onDone()
      }
    },
  })
}

/**
 * Create a child AI stream logger for Nuxt/Nitro streaming responses.
 *
 * Nitro emits the parent request wide event when the handler returns its
 * streaming `Response`, before the AI SDK finishes the body. This helper keeps
 * AI metadata on a correlated child event and sends it through the same Nitro
 * enrich/drain hooks as normal request logs.
 *
 * @example
 * ```ts
 * import { streamText, consumeStream } from 'ai'
 * import { createEvlogIntegration } from 'evlog/ai'
 * import { createNitroAIStreamLogger } from 'evlog/ai/nitro'
 *
 * export default defineEventHandler(async (event) => {
 *   const { ai, wrapResponse } = createNitroAIStreamLogger(event)
 *
 *   const result = streamText({
 *     model: ai.wrap('anthropic/claude-sonnet-4.6'),
 *     messages,
 *     experimental_telemetry: {
 *       isEnabled: true,
 *       integrations: [createEvlogIntegration(ai)],
 *     },
 *   })
 *
 *   return wrapResponse(result.toUIMessageStreamResponse({
 *     consumeSseStream: consumeStream,
 *   }))
 * })
 * ```
 */
export function createNitroAIStreamLogger<T extends object = Record<string, unknown>>(
  event: ServerEvent,
  options: NitroAIStreamLoggerOptions<T> = {},
): NitroAIStreamLogger<T> {
  const parent = useLogger(event)
  const parentContext = parent.getContext()
  const parentRequestId = typeof parentContext.requestId === 'string' ? parentContext.requestId : undefined
  const parentService = typeof parentContext.service === 'string' ? parentContext.service : undefined
  const waitUntil = resolveWaitUntil(event)
  const log = createRequestLogger<T>({
    method: event.method,
    path: event.path,
    requestId: crypto.randomUUID(),
    waitUntil: typeof waitUntil?.waitUntil === 'function'
      ? waitUntil.waitUntil.bind(waitUntil)
      : undefined,
  }, { _deferDrain: true })
  const operation = options.operation ?? 'ai-stream'
  let emitted = false

  log.set({
    ...(parentService ? { service: parentService } : {}),
    ...options.fields,
    operation,
    ...(parentRequestId ? { _parentRequestId: parentRequestId } : {}),
  } as FieldContext<T>)

  async function emit(fields?: NitroAIStreamFields<T>, meta: ResponseMeta = {}): Promise<WideEvent | null> {
    if (emitted) return null
    emitted = true
    const { context, forceKeep } = splitEmitFields(fields)

    if (context) {
      log.set(context)
    }

    const status = typeof fields?.status === 'number' ? fields.status : meta.status
    const emittedEvent = log.emit({
      ...(typeof status === 'number' ? { status } : {}),
      ...(forceKeep ? { _forceKeep: true } : {}),
    } as FieldContext<T> & { _forceKeep?: boolean })
    if (!emittedEvent) return null

    await enrichAndDrainNitroEvent(event, emittedEvent, {
      ...meta,
      status: typeof status === 'number' ? status : meta.status,
    })
    return emittedEvent
  }

  function wrapResponse(response: Response, fields?: NitroAIStreamFields<T>): Response {
    const meta = {
      status: response.status,
      headers: getSafeResponseHeaders(response),
    }
    if (!response.body) {
      void emit(fields, meta)
      return response
    }

    const body = createObservedBody(
      response.body,
      () => emit(fields, meta).then(() => undefined),
      (err) => {
        log.error(toError(err))
        return emit(fields, meta).then(() => undefined)
      },
    )

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }

  return {
    ai: createAILogger(log, options.ai),
    log,
    emit,
    wrapResponse,
  }
}
