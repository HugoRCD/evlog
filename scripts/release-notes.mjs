/**
 * Rewrite each published package's GitHub release body with GitHub-style notes:
 * merged pull requests, grouped into the categories from `.github/release.yml`.
 *
 * ## Why this exists
 *
 * `createGithubReleases: true` gives changesets' own body — the CHANGELOG
 * section. For a dependent package that reads:
 *
 *     ### Patch Changes
 *     - Updated dependencies [[`f39ab30`](…), [`899464a`](…), [`d7f482a`](…), …]
 *       - evlog@2.23.0
 *
 * ...which says nothing a reader can use, and packages with no changeset of
 * their own get an empty release.
 *
 * The obvious alternative, `gh release create --generate-notes`, has the
 * opposite problem: GitHub builds those notes from a commit *range*, and in a
 * monorepo the per-package tags interleave. The range between two consecutive
 * `@evlog/cli` tags sweeps up every core / telemetry / docs PR that landed in
 * between, so each package's notes list everybody's work.
 *
 * So we build the list ourselves: take the commits in the range that actually
 * touched the package's directory, resolve each to its pull request, and group
 * them with the same label → category mapping GitHub uses. The output is
 * indistinguishable from GitHub's, but correctly scoped.
 *
 * ## Usage
 *
 *     node scripts/release-notes.mjs '[{"name":"evlog","version":"2.24.0"}]'
 *
 * Rehearse it locally before a tag exists:
 *
 *     GITHUB_TOKEN=$(gh auth token) DRY_RUN=1 RELEASE_NOTES_REF=HEAD \
 *       node scripts/release-notes.mjs '[{"name":"evlog","version":"2.24.0"}]'
 *
 * ## Env
 *
 * - `GITHUB_TOKEN`       required, used for the PR lookups and `gh release edit`
 * - `GITHUB_REPOSITORY`  owner/repo (set by Actions; falls back to the git remote)
 * - `DRY_RUN=1`          print the notes instead of editing the releases
 * - `RELEASE_NOTES_REF`  end of the commit range (default: the release tag)
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

function resolveRepo() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY
  const url = git('remote', 'get-url', 'origin')
  const match = url.match(/github\.com[:/](.+?)(?:\.git)?$/)
  if (!match) throw new Error(`cannot derive owner/repo from remote "${url}"`)
  return match[1]
}

/** Map every workspace package name to its directory. */
function packageDirs() {
  const root = resolve(process.cwd(), 'packages')
  const out = new Map()
  for (const entry of readdirSync(root)) {
    try {
      const pkg = JSON.parse(readFileSync(resolve(root, entry, 'package.json'), 'utf8'))
      if (pkg.name) out.set(pkg.name, `packages/${entry}`)
    } catch {
      // not a package directory
    }
  }
  return out
}

/**
 * Read the category order out of `.github/release.yml` so the sections match
 * what GitHub produces for a hand-generated release. Minimal parse — the file
 * is a fixed shape we own, and this avoids a YAML dependency in CI.
 */
function releaseConfig() {
  let text
  try {
    text = readFileSync(resolve(process.cwd(), '.github/release.yml'), 'utf8')
  } catch {
    return { categories: [], excludedLabels: [], excludedAuthors: [] }
  }

  const categories = []
  const excludedLabels = []
  const excludedAuthors = []
  let section = null      // 'exclude' | 'categories'
  let excludeKey = null   // 'labels' | 'authors' — they are separate lists
  let current = null

  for (const line of text.split('\n')) {
    if (/^\s{2}exclude:/.test(line)) { section = 'exclude'; excludeKey = null; continue }
    if (/^\s{2}categories:/.test(line)) { section = 'categories'; continue }
    if (section === 'exclude') {
      if (/^\s*labels:/.test(line)) { excludeKey = 'labels'; continue }
      if (/^\s*authors:/.test(line)) { excludeKey = 'authors'; continue }
    }

    const title = line.match(/^\s*-\s*title:\s*(.+?)\s*$/)
    if (title && section === 'categories') {
      current = { title: title[1], labels: [] }
      categories.push(current)
      continue
    }
    const item = line.match(/^\s*-\s*(\S.*?)\s*$/)
    if (item && !line.includes(':')) {
      if (section === 'categories' && current) current.labels.push(item[1])
      else if (section === 'exclude' && excludeKey === 'labels') excludedLabels.push(item[1])
      else if (section === 'exclude' && excludeKey === 'authors') excludedAuthors.push(item[1])
    }
  }
  return { categories, excludedLabels, excludedAuthors }
}

/**
 * The tag this package was released under last time.
 *
 * Falls back to the newest `v*` tag from before the repo moved to per-package
 * tags, so an early per-package release still gets a bounded range instead of
 * the entire history.
 */
function previousTag(name, currentTag) {
  const scoped = git('tag', '--list', `${name}@*`, '--sort=-creatordate')
    .split('\n')
    .filter(t => t && t !== currentTag)
  if (scoped.length > 0) return scoped[0]

  const legacy = git('tag', '--list', 'v*', '--sort=-creatordate').split('\n').filter(Boolean)
  return legacy[0] ?? null
}

/** Commits in (from, to] that touched the package directory. */
function commitsTouching(dir, from, to) {
  const range = from ? `${from}..${to}` : to
  const out = git('log', range, '--format=%H', '--no-merges', '--', dir)
  return out ? out.split('\n').filter(Boolean) : []
}

async function pullsForCommit(repo, sha, token) {
  const res = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}/pulls`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) {
    console.warn(`[release-notes] PR lookup failed for ${sha.slice(0, 8)}: ${res.status}`)
    return []
  }
  return await res.json()
}

/** Render in GitHub's own shape, so the result reads like a generated release. */
function renderNotes({ repo, pulls, previous, tag, config }) {
  const line = pr => `* ${pr.title} by @${pr.author} in https://github.com/${repo}/pull/${pr.number}`
  const remaining = new Set(pulls.map(p => p.number))
  const sections = []

  for (const category of config.categories) {
    const matched = pulls.filter(p =>
      remaining.has(p.number) && p.labels.some(l => category.labels.includes(l)),
    )
    if (matched.length === 0) continue
    for (const p of matched) remaining.delete(p.number)
    sections.push(`### ${category.title}\n${matched.map(line).join('\n')}`)
  }

  // GitHub files anything unlabelled under "Other Changes".
  const others = pulls.filter(p => remaining.has(p.number))
  if (others.length > 0) sections.push(`### Other Changes 🔨\n${others.map(line).join('\n')}`)

  const body = sections.length > 0
    ? `## What's Changed\n${sections.join('\n')}`
    : `## What's Changed\n_No pull requests touched this package in this release._`

  const compare = previous
    ? `\n\n**Full Changelog**: https://github.com/${repo}/compare/${previous}...${tag}`
    : ''
  return body + compare
}

async function main() {
  const raw = process.argv[2]
  if (!raw) throw new Error('usage: release-notes.mjs \'[{"name":"evlog","version":"1.0.0"}]\'')

  const published = JSON.parse(raw)
  if (!Array.isArray(published) || published.length === 0) {
    console.log('[release-notes] nothing published, skipping')
    return
  }

  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN is required')
  const repo = resolveRepo()
  const dirs = packageDirs()
  const config = releaseConfig()
  const dryRun = process.env.DRY_RUN === '1'

  for (const { name, version } of published) {
    const tag = `${name}@${version}`
    const dir = dirs.get(name)
    if (!dir) {
      console.warn(`[release-notes] no directory for ${name}, skipping`)
      continue
    }

    const previous = previousTag(name, tag)
    const head = process.env.RELEASE_NOTES_REF ?? tag
    const shas = commitsTouching(dir, previous, head)

    // One PR can carry several commits; keep first-seen order (newest first).
    const seen = new Map()
    for (const sha of shas) {
      for (const pr of await pullsForCommit(repo, sha, token)) {
        if (!pr.merged_at || seen.has(pr.number)) continue
        const author = pr.user?.login ?? 'unknown'
        if (config.excludedAuthors.includes(author)) continue
        const labels = (pr.labels ?? []).map(l => l.name)
        if (labels.some(l => config.excludedLabels.includes(l))) continue
        seen.set(pr.number, {
          number: pr.number,
          title: pr.title,
          author,
          labels,
        })
      }
    }

    const pulls = [...seen.values()]
    const notes = renderNotes({ repo, pulls, previous, tag, config })
    console.log(`\n── ${tag}  (${pulls.length} PR${pulls.length === 1 ? '' : 's'} since ${previous ?? 'repo start'})`)

    if (dryRun) {
      console.log(notes)
      continue
    }

    execFileSync('gh', ['release', 'edit', tag, '--notes', notes], {
      stdio: 'inherit',
      env: { ...process.env, GH_TOKEN: token },
    })
    console.log(`[release-notes] updated ${tag}`)
  }
}

await main()
