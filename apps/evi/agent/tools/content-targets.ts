import { defineTool } from 'eve/tools'
import { z } from 'zod'
import type { LintPage } from '../lib/content/selection'
import { selectTargets, touchedPaths } from '../lib/content/selection'

/** The template clone; every session inherits it with dependencies installed. */
const REPO_DIR = '/workspace/repo'

const DEFAULT_COOLDOWN_DAYS = 14

/**
 * Read-only, so it stays visible on every turn: the daily content pass runs
 * unattended, and a pass that cannot see its targets does nothing at all.
 */
export default defineTool({
  description: `Pick the files the next content pass should work on. Runs the repository's content-lint over every written surface in ${REPO_DIR} (docs pages, the landing, the package READMEs, the skills, the AGENTS.md files), drops files changed inside the cooldown window, and returns the highest-priority files from a single group with their findings. Criticals (a broken import, a dead link) outrank a low score. Landing findings come back as \`report\` rather than \`rewrite\`, and so does anything on a skill or an AGENTS.md that is not a house rule, because those files govern the agent running the pass. Pass \`surface\` to work one kind of file. Call this before reviewing or rewriting anything; the findings it returns are candidates to judge against the write-evlog-content skill, not verdicts.`,
  inputSchema: z.object({
    limit: z.number().int().min(1).max(5).optional().describe('How many files this pass may open. Default 3.'),
    cooldownDays: z.number().int().min(1).max(90).optional().describe(`Days a file rests after any change touches it. Default ${DEFAULT_COOLDOWN_DAYS}.`),
    surface: z.enum(['docs', 'reference', 'landing', 'blog', 'readme', 'skill', 'agents']).optional().describe('Restrict the scan to one surface. Omit to rank the whole corpus.'),
  }),
  async execute(input, toolCtx) {
    const sandbox = await toolCtx.getSandbox()
    const cooldownDays = input.cooldownDays ?? DEFAULT_COOLDOWN_DAYS
    const surface = input.surface ? ` --surface ${input.surface}` : ''

    const scan = await sandbox.run({
      command: `cd ${REPO_DIR} && node scripts/content-lint/index.mjs --json${surface}`,
    })
    if (scan.exitCode !== 0) {
      return { success: false as const, error: `content-lint exited ${scan.exitCode}: ${String(scan.stderr || scan.stdout).trim()}` }
    }

    let report: { baseline: unknown, pages: LintPage[] }
    try {
      report = JSON.parse(String(scan.stdout)) as { baseline: unknown, pages: LintPage[] }
    } catch {
      return { success: false as const, error: 'content-lint returned output that is not JSON.' }
    }
    if (!Array.isArray(report.pages)) {
      return { success: false as const, error: 'content-lint returned no pages array.' }
    }

    const log = await sandbox.run({
      command: `git -C ${REPO_DIR} log --since='${cooldownDays} days ago' --name-only --pretty=format:`,
    })
    if (log.exitCode !== 0) {
      return { success: false as const, error: `git log exited ${log.exitCode}: ${String(log.stderr || log.stdout).trim()}` }
    }

    const selection = selectTargets({
      pages: report.pages,
      recentlyTouched: touchedPaths(String(log.stdout)),
      limit: input.limit,
    })

    return {
      success: true as const,
      baseline: report.baseline,
      scanned: report.pages.length,
      cooldownDays,
      group: selection.group,
      targets: selection.targets,
      held: selection.held.slice(0, 10),
    }
  },
})
