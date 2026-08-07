/**
 * Where this process is running, as one label.
 *
 * Shared by the gateway spend tags and the evlog wide events so a run that bills
 * as `eval` also logs as `eval`. `EVE_RUN_MODE` is set by the `eval` script; it
 * does not reach a deployment behind `eve eval --url`.
 */
export function environment(): string {
  if (process.env.EVE_RUN_MODE === 'eval') return 'eval'
  return process.env.VERCEL_ENV ?? 'local'
}

/** False on Vercel, where everything outside `/tmp` is read-only. */
export function hasDurableDisk(): boolean {
  return process.env.VERCEL !== '1'
}
