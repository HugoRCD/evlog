/**
 * Extract HTTP status from an error, checking both `status` and `statusCode`.
 *
 * Works with any error shape (H3, Nitro, EvlogError, plain objects).
 *
 * @beta This function is part of the evlog toolkit API for building custom framework integrations.
 */
export function extractErrorStatus(error: unknown): number {
  if (error === null || typeof error !== 'object') return 500
  const raw = (error as { status?: unknown }).status
    ?? (error as { statusCode?: unknown }).statusCode
  const status = Number(raw)
  return Number.isFinite(status) ? status : 500
}
