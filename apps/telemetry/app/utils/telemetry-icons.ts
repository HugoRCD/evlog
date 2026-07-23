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

/** Display label for an agent — `null` means no agent was detected. */
export function agentLabel(agent: string | null): string {
  return agent ?? 'terminal'
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

export function providerIcon(provider: string): string {
  return PROVIDER_ICONS[provider.toLowerCase()] ?? 'i-nucleo-server'
}

/** `github_actions` → `github actions` — provider slugs read better without underscores. */
export function providerLabel(provider: string): string {
  return provider.replaceAll('_', ' ')
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

export function osLabel(os: string | null): string {
  if (os === null) return 'unknown'
  return OS_LABELS[os] ?? os
}
