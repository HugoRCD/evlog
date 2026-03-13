/**
 * Extract HTTP status from an error, checking both `status` and `statusCode`.
 *
 * Works with any error shape (H3, Nitro, EvlogError, plain objects).
 *
 * @beta This function is part of the evlog toolkit API for building custom framework integrations.
 */
export function extractErrorStatus(error: unknown): number {
  return (error as { status?: number }).status
    ?? (error as { statusCode?: number }).statusCode
    ?? 500
}
