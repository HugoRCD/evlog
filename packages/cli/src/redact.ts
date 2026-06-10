import { auditRedactPreset } from 'evlog'
import type { RedactConfig } from 'evlog'

/**
 * CLI-specific redact preset extending {@link auditRedactPreset}.
 *
 * Covers env files, flag secrets, and common API token shapes.
 */
export const cliRedactPreset: RedactConfig = {
  paths: [
    'env.*',
    'variables.*.value',
    'flags.token',
    'flags.password',
    'flags.secret',
    'flags.apiKey',
    'config.token',
    'config.secret',
    'cli.flags.token',
    'cli.flags.password',
    'cli.flags.secret',
    'cli.flags.apiKey',
  ],
  patterns: [
    /\b(?:shlv_[\w-]+|sk_[\w-]+)\b/g,
    /\bBearer\s+[\w\-.~+/]{8,}=*/gi,
  ],
}

/**
 * Resolve the effective redact config for a CLI bootstrap.
 *
 * @param redact - `true` merges audit + CLI presets; `false` disables redaction.
 */
export function resolveCliRedact(redact?: boolean | RedactConfig): boolean | RedactConfig | undefined {
  if (redact === false) return false
  if (typeof redact === 'object') {
    return {
      paths: [
        ...(auditRedactPreset.paths ?? []),
        ...(cliRedactPreset.paths ?? []),
        ...(redact.paths ?? []),
      ],
      patterns: [
        ...(cliRedactPreset.patterns ?? []),
        ...(redact.patterns ?? []),
      ],
    }
  }
  return {
    paths: [
      ...(auditRedactPreset.paths ?? []),
      ...(cliRedactPreset.paths ?? []),
    ],
    patterns: cliRedactPreset.patterns,
  }
}
