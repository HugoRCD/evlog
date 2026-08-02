import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The published evlog skills, installed by delegating to `npx skills`.
 *
 * We do not copy skill files ourselves. Every agent reads a different directory
 * (`.claude/skills`, `.agents/skills`, `.codex/skills`, …), the skills CLI
 * already resolves that per agent, symlinks a canonical copy, and owns
 * `update` / `remove` / `list` — and it keeps no manifest, so anything we wrote
 * behind its back would be a second copy it could never update.
 *
 * So this module does two things: notice when the skills are already there, and
 * shell out when they are not. Same shape as `init` running the package manager
 * rather than unpacking a tarball itself.
 */

/** Where the skills are published. Overridable so forks can point elsewhere. */
export const DEFAULT_SOURCE = 'https://www.evlog.dev'

/**
 * Skill directories published from the docs site.
 *
 * Used only to notice an existing install. A name that goes stale here costs
 * one redundant `npx skills add`, which is why it is not worth a network call.
 */
export const EVLOG_SKILLS = ['review-logging-patterns', 'build-audit-logs', 'analyze-logs'] as const

/** Per-agent skill directories, relative to a project root or to `$HOME`. */
const AGENT_DIRS = [
  '.claude/skills',
  '.agents/skills',
  '.cursor/skills',
  '.codex/skills',
  '.opencode/skills',
]

export interface InstalledSkills {
  /** Skill names found on disk, in any agent's directory. */
  names: string[]
  /** The directories they were found in, relative to the project or `~`. */
  dirs: string[]
}

/**
 * Look for evlog skills already installed, project-local and global.
 *
 * Deliberately generous: any agent, either scope. Somebody who ran
 * `npx skills add` last month should not be told to run it again.
 *
 * @param home - The global scope to search, from {@link CliContext.home}.
 */
export function findInstalledSkills(root: string, home: string): InstalledSkills {
  const names = new Set<string>()
  const dirs = new Set<string>()

  for (const [base, label] of [[root, ''], [home, '~/']] as const) {
    for (const dir of AGENT_DIRS) {
      for (const skill of EVLOG_SKILLS) {
        if (!existsSync(join(base, dir, skill))) continue
        names.add(skill)
        dirs.add(`${label}${dir}`)
      }
    }
  }

  return { names: [...names].sort(), dirs: [...dirs].sort() }
}

export interface SkillsCommand {
  /** The command line, as the user would type it. */
  display: string
  bin: string
  args: string[]
}

/**
 * Build the `npx skills add` invocation.
 *
 * `--yes` only when nobody is watching: interactively, the skills CLI asks
 * which agents to install for, and that question is its to ask.
 */
export function skillsCommand(options: {
  source?: string
  skills?: readonly string[]
  global?: boolean
  interactive: boolean
}): SkillsCommand {
  const args = ['--yes', 'skills', 'add', options.source ?? DEFAULT_SOURCE]
  if (options.skills?.length) args.push('--skill', ...options.skills)
  if (options.global) args.push('--global')
  if (!options.interactive) args.push('--yes')

  /* `npx --yes` suppresses the install prompt for the skills package itself and
     is noise in a command somebody may retype. */
  return { display: `npx ${args.slice(1).join(' ')}`, bin: 'npx', args }
}

/**
 * Run it, returning the failure rather than throwing.
 *
 * The `AGENTS.md` block is already on disk by this point and stands on its own;
 * losing it because a subprocess could not reach the network would be the wrong
 * trade. Interactive runs inherit the terminal so the skills CLI can ask its
 * own questions.
 */
export function runSkills(
  command: SkillsCommand,
  cwd: string,
  interactive: boolean,
): Promise<{ ok: true } | { ok: false, error: string }> {
  return new Promise((resolve) => {
    const child = spawn(command.bin, command.args, {
      cwd,
      stdio: interactive ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      timeout: 5 * 60_000,
    })

    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      resolve({ ok: false, error: error.message })
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true })
        return
      }
      const line = stderr.trim().split('\n').filter(Boolean).at(-1)
      resolve({ ok: false, error: line ?? `npx skills add exited ${code}` })
    })
  })
}
