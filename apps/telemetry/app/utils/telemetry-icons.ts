/**
 * Icon + label maps for the telemetry breakdowns — one place so an agent,
 * CI provider, or OS always reads the same way across the dashboard.
 */

const AGENT_ICONS: Record<string, string> = {
  'claude': 'i-simple-icons-claude',
  'claude-code': 'i-simple-icons-claude',
  'cursor': 'i-simple-icons-cursor',
  'copilot': 'i-simple-icons-githubcopilot',
  'codex': 'i-simple-icons-openai',
  'openai': 'i-simple-icons-openai',
  'windsurf': 'i-simple-icons-windsurf',
  'gemini': 'i-simple-icons-googlegemini',
  'replit': 'i-simple-icons-replit',
}

/** Icon for an AI coding agent — `null` (plain terminal run) gets the human icon. */
export function agentIcon(agent: string | null): string {
  if (agent === null) return 'i-nucleo-user'
  return AGENT_ICONS[agent.toLowerCase()] ?? 'i-nucleo-sparkle-outline'
}

const PROVIDER_ICONS: Record<string, string> = {
  github_actions: 'i-simple-icons-githubactions',
  gitlab: 'i-simple-icons-gitlab',
  vercel: 'i-simple-icons-vercel',
  netlify: 'i-simple-icons-netlify',
  circleci: 'i-simple-icons-circleci',
  jenkins: 'i-simple-icons-jenkins',
  travis: 'i-simple-icons-travisci',
  bitbucket: 'i-simple-icons-bitbucket',
  azure_pipelines: 'i-simple-icons-azuredevops',
  codeberg: 'i-simple-icons-codeberg',
  buildkite: 'i-simple-icons-buildkite',
}

/** Icon for a CI provider — a plain server glyph for providers without a dedicated logo. */
export function providerIcon(provider: string): string {
  return PROVIDER_ICONS[provider.toLowerCase()] ?? 'i-nucleo-server'
}

/** `github_actions` → `github actions` — provider slugs read better without underscores. */
export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider.toLowerCase()] ?? titleCase(provider.replaceAll('_', ' '))
}

/**
 * Providers and agents arrive as slugs from `std-env`, and rendering them raw
 * gives you "github actions" and "claude-code_2-1-220_agent" side by side in a
 * panel that is otherwise carefully typeset. Every known name gets its real
 * spelling; anything unrecognised is title-cased rather than left lowercase.
 */
const PROVIDER_LABELS: Record<string, string> = {
  github_actions: 'GitHub Actions',
  gitlab: 'GitLab',
  vercel: 'Vercel',
  netlify: 'Netlify',
  circleci: 'CircleCI',
  jenkins: 'Jenkins',
  travis: 'Travis CI',
  bitbucket: 'Bitbucket',
  azure_pipelines: 'Azure Pipelines',
  codeberg: 'Codeberg',
  buildkite: 'Buildkite',
  cloudflare_pages: 'Cloudflare Pages',
  render: 'Render',
  heroku: 'Heroku',
  // `env.ci` was set but the client couldn't name the provider — a real state,
  // and one that has to render as something rather than as a blank row.
  unknown: 'Unknown CI',
}

const AGENT_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  'claude': 'Claude',
  'cursor': 'Cursor',
  'codex': 'Codex',
  'copilot': 'Copilot',
  'windsurf': 'Windsurf',
  'gemini': 'Gemini',
  'replit': 'Replit',
  'zed': 'Zed',
  'aider': 'Aider',
  'cline': 'Cline',
  'pi': 'Pi',
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, character => character.toUpperCase())
}

/** Version segments arrive dash-separated (`2-1-220`), which reads as a range rather than a version. */
const VERSION_PART = /^\d+(?:[-.]\d+)+$/

/**
 * Agent ids can carry a version and a variant: `claude-code_2-1-220_agent`.
 * Splitting them out lets the name stand on its own and the rest sit beside it
 * as detail, instead of one long slug doing three jobs at once.
 */
export function parseAgentId(id: string): { name: string, version?: string, variant?: string } {
  const parts = id.split('_').filter(Boolean)
  const name = parts[0] ?? id

  const version = parts.slice(1).find(part => VERSION_PART.test(part))?.replaceAll('-', '.')
  const variant = parts.slice(1).find(part => !VERSION_PART.test(part))

  return {
    name: AGENT_LABELS[name.toLowerCase()] ?? titleCase(name.replaceAll('-', ' ')),
    version,
    variant,
  }
}

/** Icon for a source — CI providers and agents keep their own logo; the two local kinds get a glyph. */
export function sourceIcon(source: SourceRef): string {
  switch (source.kind) {
    case 'ci': return providerIcon(source.id)
    case 'agent': return agentIcon(source.id.split('_')[0] ?? source.id)
    case 'terminal': return 'i-nucleo-terminal'
    case 'automation': return 'i-nucleo-bolt'
  }
}

/** Human label for a source — `github_actions` reads as `github actions`, the local kinds name themselves. */
export function sourceLabel(source: SourceRef): string {
  switch (source.kind) {
    case 'ci': return providerLabel(source.id)
    case 'agent': return parseAgentId(source.id).name
    case 'terminal': return 'Terminal'
    case 'automation': return 'Automation'
  }
}

/**
 * The part of a source's identity that isn't its name — an agent's version and
 * variant. Rendered beside the label in a dimmer weight so two builds of the
 * same agent are distinguishable without every row turning into a slug.
 */
export function sourceDetail(source: SourceRef): string | undefined {
  if (source.kind !== 'agent') return undefined

  const { version, variant } = parseAgentId(source.id)
  return [version, variant].filter(Boolean).join(' · ') || undefined
}

const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  ci: 'CI',
  agent: 'AI agents',
  terminal: 'Terminal',
  automation: 'Automation',
}

/** Label for a whole source kind, as shown on the composition bar's legend. */
export function sourceKindLabel(kind: SourceKind): string {
  return SOURCE_KIND_LABELS[kind]
}

const SOURCE_KIND_HINTS: Record<SourceKind, string> = {
  ci: 'pipelines and hosted builds',
  agent: 'runs driven by a coding agent',
  terminal: 'someone at a keyboard',
  automation: 'scripts, hooks, cron',
}

/** One-line explanation of what a source kind covers. */
export function sourceKindHint(kind: SourceKind): string {
  return SOURCE_KIND_HINTS[kind]
}

const OS_ICONS: Record<string, string> = {
  darwin: 'i-simple-icons-apple',
  linux: 'i-simple-icons-linux',
  win32: 'i-simple-icons-windows',
}

const OS_LABELS: Record<string, string> = {
  darwin: 'macOS',
  linux: 'Linux',
  win32: 'Windows',
}

/** Icon for an OS platform — `null` (older clients) falls back to a laptop glyph. */
export function osIcon(os: string | null): string {
  if (os === null) return 'i-nucleo-laptop'
  return OS_ICONS[os] ?? 'i-nucleo-laptop'
}

/** Display label for an OS platform — `null` (older clients) reads as "unknown"; unrecognized platforms keep their raw value. */
export function osLabel(os: string | null): string {
  if (os === null) return 'unknown'
  return OS_LABELS[os] ?? os
}
