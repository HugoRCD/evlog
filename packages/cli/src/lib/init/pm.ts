import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)

/** Package managers `init` knows how to add a dependency with. */
export type PackageManager = 'pnpm' | 'bun' | 'yarn' | 'npm'

const LOCKFILES: Record<PackageManager, string[]> = {
  pnpm: ['pnpm-lock.yaml'],
  bun: ['bun.lock', 'bun.lockb'],
  yarn: ['yarn.lock'],
  npm: ['package-lock.json'],
}

/**
 * Pick the package manager from lockfiles, nearest directory first.
 *
 * `packageManager` in package.json would be more explicit when it is there, but
 * it usually is not, and a workspace lockfile at the root is the thing that
 * actually decides which client can install into this package.
 */
export function detectPackageManager(dirs: string[]): PackageManager {
  for (const dir of dirs) {
    for (const [manager, files] of Object.entries(LOCKFILES) as [PackageManager, string[]][]) {
      if (files.some(file => existsSync(join(dir, file)))) return manager
    }
  }
  return 'npm'
}

/** The command line that adds `evlog`, as the user would type it. */
export function installCommand(manager: PackageManager, pkg = 'evlog'): string {
  return manager === 'npm' ? `npm install ${pkg}` : `${manager} add ${pkg}`
}

/**
 * Run the install in `cwd`.
 *
 * Returns the failure instead of throwing: an install that could not run is a
 * step the user finishes by hand, not a reason to abandon the wiring that
 * already landed on disk.
 */
export async function runInstall(
  manager: PackageManager,
  cwd: string,
  pkg = 'evlog',
): Promise<{ ok: true } | { ok: false, error: string }> {
  const args = manager === 'npm' ? ['install', pkg] : ['add', pkg]
  try {
    await exec(manager, args, { cwd, timeout: 5 * 60_000 })
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message.split('\n')[0] ?? message }
  }
}
