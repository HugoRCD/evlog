import { HTTPError } from 'nitro/h3'
import type { ErrorOptions } from '../types'
import { colors, isServer } from '../utils'

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
export class EvlogError extends HTTPError {

  readonly status: number
  readonly why?: string
  readonly fix?: string
  readonly link?: string

  override get name(): string {
    return 'EvlogError'
  }

  constructor(options: ErrorOptions | string) {
    const opts = typeof options === 'string' ? { message: options } : options

    const body = opts.why || opts.fix || opts.link
      ? { why: opts.why, fix: opts.fix, link: opts.link }
      : undefined

    super(opts.message, { cause: opts.cause, body })

    this.status = opts.status ?? 500
    this.why = opts.why
    this.fix = opts.fix
    this.link = opts.link

    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EvlogError)
    }
  }

  get statusCode(): number {
    return this.status
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

}

/**
 * Create a structured error with context for debugging and user-facing messages.
 *
 * @param options - Error message string or full options object
 * @returns EvlogError instance compatible with Nitro's error handling
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

export const createEvlogError = createError
