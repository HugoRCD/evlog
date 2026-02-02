import type { FetchError } from 'ofetch'
import type { ParsedError } from '../../types'

export type { ParsedError }

export function parseError(error: unknown): ParsedError {
  if (error && typeof error === 'object' && 'data' in error) {
    const { data, message: fetchMessage, statusCode: fetchStatusCode, status: fetchStatus } = error as FetchError & { status?: number }

    const evlogData = data?.data as { why?: string, fix?: string, link?: string } | undefined

    return {
      // Nitro v3+: statusText, Nitro v2: statusMessage
      message: data?.statusText || data?.statusMessage || data?.message || fetchMessage || 'An error occurred',
      // Nitro v3+: status, Nitro v2: statusCode
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
