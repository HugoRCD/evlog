import { execFileSync } from 'node:child_process'

const CONTENT_PREFIX = 'content/'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parses `git log --format=%cs --name-only --relative` output into a map of content
 * stem to the date of the commit that last touched it. Commits come newest first,
 * so the first date seen for a stem is the answer.
 */
export function parseCommitDates(gitLog: string): Record<string, string> {
  const dates: Record<string, string> = {}
  let commitDate = ''

  for (const line of gitLog.split('\n')) {
    if (!line) continue

    if (ISO_DATE.test(line)) {
      commitDate = line
      continue
    }

    if (!line.startsWith(CONTENT_PREFIX)) continue

    const stem = line.slice(CONTENT_PREFIX.length).replace(/\.[^./]+$/, '')
    dates[stem] ??= commitDate
  }

  return dates
}

/**
 * Sitemap `lastmod` is the recrawl signal Google acts on, and no content file carries
 * `modifiedAt` frontmatter, so the date comes from each file's last commit. A shallow
 * clone collapses every file onto the same date: `vercel.json` unshallows before build.
 */
export function readContentCommitDates(cwd: string): Record<string, string> {
  const gitLog = execFileSync(
    'git',
    ['log', '--format=%cs', '--name-only', '--relative', '--diff-filter=d', '--', CONTENT_PREFIX],
    { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )

  return parseCommitDates(gitLog)
}
