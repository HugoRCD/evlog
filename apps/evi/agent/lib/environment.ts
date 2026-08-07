/**
 * Where this process is running, as one label.
 *
 * Shared on purpose: the gateway spend tags and the evlog wide events both key
 * off it, so a run that bills as `eval` also logs as `eval`. When they disagree
 * you cannot line the two up, and eval traffic silently pollutes whatever you
 * thought was production.
 *
 * `EVE_RUN_MODE=eval` is set by the `eval` script in package.json. The eval
 * runner boots the agent as a child of that process, so the variable reaches the
 * server under test. It does not reach a deployment behind `eve eval --url`,
 * where a run is whatever environment that deployment is.
 */
export function environment(): string {
  if (process.env.EVE_RUN_MODE === 'eval') return 'eval'
  return process.env.VERCEL_ENV ?? 'local'
}

/**
 * Whether the process has a writable working directory it will still have on the
 * next turn. False on Vercel, where everything outside `/tmp` is read-only and
 * `/tmp` does not survive the instance.
 */
export function hasDurableDisk(): boolean {
  return process.env.VERCEL !== '1'
}
