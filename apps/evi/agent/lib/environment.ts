/**
 * Where this process is running. Shared by the gateway spend tags and the evlog
 * wide events so both label a run the same way. `EVE_RUN_MODE` comes from the
 * `eval` script and does not reach a deployment behind `eve eval --url`.
 */
export function environment(): string {
  if (process.env.EVE_RUN_MODE === 'eval') return 'eval'
  return process.env.VERCEL_ENV ?? 'local'
}
