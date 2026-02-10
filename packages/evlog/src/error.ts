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

  /** HTTP status code */
  readonly status: number
  readonly why?: string
  readonly fix?: string
  readonly link?: string

  constructor(options: ErrorOptions | string) {
    const opts = typeof options === 'string' ? { message: options } : options

    super(opts.message, { cause: opts.cause })

    this.name = 'EvlogError'
    this.status = opts.status ?? 500
    this.why = opts.why
    this.fix = opts.fix
    this.link = opts.link

    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EvlogError)
    }
  }

  /** HTTP status text (alias for message) */
  get statusText(): string {
    return this.message
  }

  /** HTTP status code (alias for compatibility) */
  get statusCode(): number {
    return this.status
  }

  /** HTTP status message (alias for compatibility) */
  get statusMessage(): string {
    return this.message
  }

  /** Structured data for serialization */
  get data(): { why?: string, fix?: string, link?: string } | undefined {
    if (this.why || this.fix || this.link) {
      return { why: this.why, fix: this.fix, link: this.link }
    }
    return undefined
  }

  override toString(): string {
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
    const { data } = this
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      ...(data && { data }),
      ...(this.cause instanceof Error && {
        cause: { name: this.cause.name, message: this.cause.message },
      }),
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
