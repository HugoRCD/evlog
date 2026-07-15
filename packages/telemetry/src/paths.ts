import { homedir } from 'node:os'
import { join } from 'node:path'

/** Per-tool telemetry config directory under XDG or `~/.config`. */
export function getTelemetryDir(toolName: string): string {
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(base, toolName, 'telemetry')
}
