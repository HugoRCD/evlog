#!/usr/bin/env tsx
/**
 * Minimal citty CLI to manually exercise @evlog/telemetry (withTelemetry path).
 *
 * Usage:
 *   pnpm run cli -- doctor
 *   pnpm run cli -- ping --name world
 *   pnpm run cli -- telemetry status
 *
 * Debug payloads on stderr:
 *   EVLOG_TELEMETRY_DEBUG=1 pnpm run cli -- doctor
 *
 * Reset first-run notice:
 *   rm ~/.config/evlog-telemetry-playground/telemetry/notice-shown
 */
import { defineCommand, runMain } from 'citty'
import { defineTelemetryCommands, telemetry, withTelemetry } from '@evlog/telemetry'

const TOOL = 'evlog-telemetry-playground'
const VERSION = '0.0.0'

const main = withTelemetry(
  defineCommand({
    meta: {
      name: 'evlog-telemetry',
      description: 'Playground CLI for @evlog/telemetry',
      version: VERSION,
    },
    subCommands: {
      doctor: {
        meta: { name: 'doctor', description: 'Smoke-check telemetry wiring' },
        args: {
          json: { type: 'boolean', alias: 'j', description: 'JSON on stdout' },
        },
        run({ args }) {
          telemetry.set({ checksFailed: 0, checksWarn: 0 })
          const payload = { ok: true, tool: TOOL, version: VERSION }
          if (args.json) {
            process.stdout.write(`${JSON.stringify(payload)}\n`)
          } else {
            process.stdout.write('telemetry playground: ok\n')
          }
        },
      },
      ping: {
        meta: { name: 'ping', description: 'Echo a name (string flag → presence only)' },
        args: {
          name: { type: 'string', description: 'Name to greet' },
          loud: { type: 'boolean', description: 'Shout' },
        },
        run({ args }) {
          telemetry.set({ loud: Boolean(args.loud) })
          const who = args.name ?? 'telemetry'
          process.stdout.write(args.loud ? `PONG ${who}!\n` : `pong ${who}\n`)
        },
      },
      telemetry: defineTelemetryCommands({ name: TOOL }),
    },
  }),
  {
    name: TOOL,
    version: VERSION,
    collect: {
      flags: { format: ['json', 'text'] },
    },
  },
)

runMain(main)
