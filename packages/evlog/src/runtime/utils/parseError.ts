import type { FetchError } from 'ofetch'
import type { ParsedError } from '../../types'

export type { ParsedError }

export function parseError(error: unknown): ParsedError {
  if (error && typeof error === 'object' && 'data' in error) {
    const { data, message: fetchMessage, statusCode: fetchStatusCode, status: fetchStatus } = error as FetchError & { status?: number }

    // Support both nested data.data (fetch response) and direct data (EvlogError)
    const evlogData = (data?.data ?? data) as { why?: string, fix?: string, link?: string } | undefined

    return {
      // Prefer statusText, then statusMessage (or message) for the error message
      message: data?.statusText || data?.statusMessage || data?.message || fetchMessage || 'An error occurred',
      // Prefer status, then statusCode for the status value
      status: data?.status || data?.statusCode || fetchStatus || fetchStatusCode || 500,
      why: evlogData?.why,
      fix: evlogData?.fix,
      link: evlogData?.link,
      raw: error,
    }
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      status: 500,
      raw: error,
    }
  }

  return {
    message: String(error),
    status: 500,
    raw: error,
  }
}
