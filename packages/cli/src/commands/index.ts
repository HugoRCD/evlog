import doctor from './doctor'
import telemetry from './telemetry'

/**
 * Root subcommand registry.
 *
 * Adding a command:
 * 1. Create `src/commands/<name>.ts` exporting a default citty `defineCommand`
 *    (prefer `defineEvlogCommand` from `lib/command` so the branded header is automatic)
 * 2. Import it here and add one line to {@link subCommands}
 *
 * Keep `index.ts` free of command bodies — this file is the only place that
 * grows when the surface expands (audit, map, push, …).
 */
export const subCommands = {
  doctor,
  telemetry,
}
