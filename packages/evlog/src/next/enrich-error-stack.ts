/**
 * Source-map stack enrichment for Next.js dev — isolated from Nitro to avoid bundling nitropack/youch.
 */
export async function enrichNextErrorStackForDev(
  error: Error,
  options: { pretty?: boolean } = {},
): Promise<void> {
  if (process.env.NODE_ENV === 'production') return
  if (options.pretty === false) return

  const { enrichErrorStackFromNextDev } = await import('../shared/enrich-error-stack-next.node')
  enrichErrorStackFromNextDev(error)
}
