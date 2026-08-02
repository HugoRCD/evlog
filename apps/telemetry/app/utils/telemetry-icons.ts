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
  return provider.replaceAll('_', ' ')
}

/** Icon for a source — CI providers and agents keep their own logo; the two local kinds get a glyph. */
export function sourceIcon(source: SourceRef): string {
  switch (source.kind) {
    case 'ci': return providerIcon(source.id)
    case 'agent': return agentIcon(source.id)
    case 'terminal': return 'i-nucleo-terminal'
    case 'automation': return 'i-nucleo-bolt'
  }
}

/** Human label for a source — `github_actions` reads as `github actions`, the local kinds name themselves. */
export function sourceLabel(source: SourceRef): string {
  switch (source.kind) {
    case 'ci': return providerLabel(source.id)
    case 'agent': return source.id
    case 'terminal': return 'terminal'
    case 'automation': return 'automation'
  }
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
