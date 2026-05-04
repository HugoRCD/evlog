/**
 * Vitest globalSetup for end-to-end tests.
 *
 * Loads the workspace-root `.env` so a developer running `pnpm run test:e2e`
 * locally picks up their tokens automatically. In CI, the workflow injects
 * env vars directly via `env:`, so the file loader is a no-op there.
 *
 * No dotenv dependency on purpose — keeps the package surface minimal.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export default function setup(): void {
  if (process.env.GITHUB_ACTIONS) return

  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
  ]

  for (const path of candidates) {
    if (!existsSync(path)) continue
    const lines = readFileSync(path, 'utf8').split('\n')
    for (const raw of lines) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      const key = line.slice(0, eq).trim()
      let value = line.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith('\'') && value.endsWith('\''))
      ) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) {
        process.env[key] = value
      }
    }
  }
}
