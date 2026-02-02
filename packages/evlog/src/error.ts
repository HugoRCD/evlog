import type { ErrorOptions } from './types'
import { colors, isServer } from './utils'

/**
 * Structured error with context for better debugging
 *
 * @example
 * ```ts
 * throw new EvlogError({
 *   message: 'Failed to sync repository',
 *   status: 503,
 *   why: 'GitHub API rate limit exceeded',
 *   fix: 'Wait 1 hour or use a different token',
 *   link: 'https://docs.github.com/en/rest/rate-limit',
 *   cause: originalError,
 * })
 * ```
 */
export class EvlogError extends Error {

  /** HTTP status code (Nitro v3+ / H3 v2+) */
  readonly status: number
  /** HTTP status text (Nitro v3+ / H3 v2+) */
  readonly statusText: string
  /** @deprecated Use `status` instead */
  readonly statusCode: number
  /** @deprecated Use `statusText` instead */
  readonly statusMessage: string
  readonly why?: string
  readonly fix?: string
  readonly link?: string
  readonly data?: { why?: string, fix?: string, link?: string }

  constructor(options: ErrorOptions | string) {
    const opts = typeof options === 'string' ? { message: options } : options

    super(opts.message, { cause: opts.cause })

    this.name = 'EvlogError'

    const statusValue = opts.status ?? 500
    const messageValue = opts.message

    // New properties (Nitro v3+ / H3 v2+)
    this.status = statusValue
    this.statusText = messageValue
    // Legacy properties (Nitro v2 / H3 v1)
    this.statusCode = statusValue
    this.statusMessage = messageValue

    this.why = opts.why
    this.fix = opts.fix
    this.link = opts.link

    if (opts.why || opts.fix || opts.link) {
      this.data = { why: opts.why, fix: opts.fix, link: opts.link }
    }

    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EvlogError)
    }
  }

  override toString(): string {
    // Use colors only on server (terminal)
    const useColors = isServer()

    const red = useColors ? colors.red : ''
    const yellow = useColors ? colors.yellow : ''
    const cyan = useColors ? colors.cyan : ''
    const dim = useColors ? colors.dim : ''
    const reset = useColors ? colors.reset : ''
    const bold = useColors ? colors.bold : ''

    const lines: string[] = []

    lines.push(`${red}${bold}Error:${reset} ${this.message}`)

    if (this.why) {
      lines.push(`${yellow}Why:${reset} ${this.why}`)
    }

    if (this.fix) {
      lines.push(`${cyan}Fix:${reset} ${this.fix}`)
    }

    if (this.link) {
      lines.push(`${dim}More info:${reset} ${this.link}`)
    }

    if (this.cause) {
      lines.push(`${dim}Caused by:${reset} ${(this.cause as Error).message}`)
    }

    return lines.join('\n')
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      statusText: this.statusText,
      // Legacy (Nitro v2 / H3 v1)
      statusCode: this.statusCode,
      statusMessage: this.statusMessage,
      data: this.data,
      cause: this.cause instanceof Error
        ? { name: this.cause.name, message: this.cause.message }
        : undefined,
    }
  }

}

/**
 * Create a structured error with context for debugging and user-facing messages.
 *
 * @param options - Error message string or full options object
 * @returns EvlogError with HTTP metadata (`status`, `statusText`) and `data`; also includes `statusCode` and `statusMessage` for legacy compatibility
 *
 * @example
 * ```ts
 * // Simple error
 * throw createError('Something went wrong')
 *
 * // Structured error with context
 * throw createError({
 *   message: 'Payment failed',
 *   status: 402,
 *   why: 'Card declined by issuer',
 *   fix: 'Try a different payment method',
 *   link: 'https://docs.example.com/payments',
 * })
 * ```
 */
export function createError(options: ErrorOptions | string): EvlogError {
  return new EvlogError(options)
}

export { createError as createEvlogError }
