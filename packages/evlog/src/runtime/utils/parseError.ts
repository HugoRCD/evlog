import type { FetchError } from 'ofetch'
import type { ParsedError } from '../../types'
import { extractErrorStatus } from '../../shared/errors'

export type { ParsedError }

function pickCode(value: unknown): string | undefined {
  if (value && typeof value === 'object' && 'code' in value) {
    const { code } = value as { code?: unknown }
    if (typeof code === 'string') return code
  }
  return undefined
}

export function parseError(error: unknown): ParsedError {
  if (error && typeof error === 'object' && 'data' in error) {
    const { data, message: fetchMessage, statusCode: fetchStatusCode, status: fetchStatus } = error as FetchError & { status?: number }

    // Support both nested data.data (fetch response) and direct data (EvlogError)
    const evlogData = (data?.data ?? data) as { code?: string, why?: string, fix?: string, link?: string } | undefined

    return {
      // Prefer statusText, then statusMessage (or message) for the error message
      message: data?.statusText || data?.statusMessage || data?.message || fetchMessage || 'An error occurred',
      // Prefer status, then statusCode for the status value
      status: data?.status || data?.statusCode || fetchStatus || fetchStatusCode || 500,
      // Prefer the structured `data.code`, then `data.code` directly, then a top-level `error.code`
      code: pickCode(evlogData) ?? pickCode(data) ?? pickCode(error),
      why: evlogData?.why,
      fix: evlogData?.fix,
      link: evlogData?.link,
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
