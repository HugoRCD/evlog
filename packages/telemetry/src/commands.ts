import { defineCommand } from 'citty'
import { disableTelemetry, enableTelemetry } from './create'
import { generateDisclosure } from './disclosure'
import { readPreferenceSync, resolveConsent } from './consent'
import type { TelemetryOptions } from './types'

/**
 * Reusable citty subcommands: `telemetry status`, `telemetry enable`, `telemetry disable`.
 */
export function defineTelemetryCommands(options: Pick<TelemetryOptions, 'name' | 'collect'>) {
  const disclosure = generateDisclosure(options.name, options.collect)

  return defineCommand({
    meta: {
      name: 'telemetry',
      description: 'View or change anonymous usage telemetry settings',
    },
    subCommands: {
      status: {
        meta: { name: 'status', description: 'Show telemetry status and disclosure link' },
        run() {
          const enabled = resolveConsent(options.name)
          const pref = readPreferenceSync(options.name)
          process.stderr.write(`Telemetry: ${enabled ? 'enabled' : 'disabled'} (preference: ${pref})\n`)
          process.stderr.write('\n')
          process.stderr.write(disclosure.markdown)
          process.stderr.write('\n')
        },
      },
      enable: {
        meta: { name: 'enable', description: 'Enable anonymous usage telemetry' },
        async run() {
          await enableTelemetry(options.name)
          process.stderr.write(`Telemetry enabled for ${options.name}.\n`)
        },
      },
      disable: {
        meta: { name: 'disable', description: 'Disable telemetry and purge undelivered data' },
        async run() {
          await disableTelemetry(options.name)
          process.stderr.write(`Telemetry disabled for ${options.name}. Local buffer purged.\n`)
        },
      },
    },
  })
}
