import type { FetchError } from 'ofetch'
import type { ParsedError } from '../../types'
import { extractErrorStatus } from '../../shared/errors'
import { isEvlogError } from '../../shared/error-brand'

export type { ParsedError }

function pickCode(value: unknown): string | undefined {
  if (value && typeof value === 'object' && 'code' in value) {
    const { code } = value as { code?: unknown }
    if (typeof code === 'string') return code
  }
  return undefined
}

function pickRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** Whether `value` is a response body, which nests the payload under its own `data`. */
function isErrorEnvelope(value: Record<string, unknown> | undefined): boolean {
  if (!value) return false
  return 'statusCode' in value || 'statusMessage' in value || 'statusText' in value || value.error === true
}

function pickString(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const found = value?.[key]
  return typeof found === 'string' ? found : undefined
}

/**
 * An EvlogError holds the payload on `data` itself and its own message and
 * status on the error. Reading it through the envelope path below would let a
 * payload keyed `statusCode` or `statusMessage` pass itself off as the response
 * metadata.
 */
function parseEvlogError(error: { message: string, data?: unknown }): ParsedError {
  const data = pickRecord(error.data)
  return {
    message: error.message,
    status: extractErrorStatus(error),
    code: pickCode(data) ?? pickCode(error),
    why: pickString(data, 'why'),
    fix: pickString(data, 'fix'),
    link: pickString(data, 'link'),
    data,
    raw: error,
  }
}

export function parseError(error: unknown): ParsedError {
  if (isEvlogError(error)) {
    return parseEvlogError(error as { message: string, data?: unknown })
  }

  if (error && typeof error === 'object' && 'data' in error) {
    const { data, message: fetchMessage, statusCode: fetchStatusCode, status: fetchStatus } = error as FetchError & { status?: number }

    // A response body nests the payload under its own `data`. A flat body, or an
    // h3 error holding the payload directly, is the payload.
    const body = pickRecord(data)
    const payload = pickRecord(data?.data) ?? (isErrorEnvelope(body) ? undefined : body)

    return {
      // Prefer statusText, then statusMessage (or message) for the error message
      message: data?.statusText || data?.statusMessage || data?.message || fetchMessage || 'An error occurred',
      // Prefer status, then statusCode for the status value
      status: data?.status || data?.statusCode || fetchStatus || fetchStatusCode || 500,
      // Prefer the structured `data.code`, then `data.code` directly, then a top-level `error.code`
      code: pickCode(payload) ?? pickCode(data) ?? pickCode(error),
      why: pickString(payload, 'why'),
      fix: pickString(payload, 'fix'),
      link: pickString(payload, 'link'),
      data: payload,
      raw: error,
    }
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      status: extractErrorStatus(error),
      code: pickCode(error),
      raw: error,
    }
  }

  return {
    message: String(error),
    status: 500,
    raw: error,
  }
}
