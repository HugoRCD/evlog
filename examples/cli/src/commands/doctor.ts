import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import { useLogger } from '@evlog/cli'
import { errorCatalog } from '../catalogs/errors'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const doctor = defineCommand({
  meta: {
    name: 'doctor',
    description: 'Run fake health checks and emit a wide event',
  },
  args: {
    verbose: {
      type: 'boolean',
      description: 'Show per-check output',
      alias: 'v',
    },
    json: {
      type: 'boolean',
      description: 'Machine-readable stdout (app contract)',
    },
  },
  async run({ args }) {
    const log = useLogger()

    if (!args.json) {
      p.intro('evlog-demo doctor')
    }

    const s = args.json ? null : p.spinner()
    s?.start('Running checks')

    const checks = [
      { name: 'config', ok: true, ms: 12 },
      { name: 'network', ok: true, ms: 48 },
      { name: 'cache', ok: true, ms: 31 },
    ]

    for (const check of checks) {
      await sleep(40)
      log.set({ checks: checks.map(({ name, ok, ms }) => ({ name, ok, ms })) })
      if (args.verbose && !args.json) {
        p.log.info(`${check.ok ? '✓' : '✗'} ${check.name} (${check.ms}ms)`)
      }
    }

    const failed = checks.filter(c => !c.ok)
    if (failed.length > 0) {
      throw errorCatalog.CHECK_FAILED({ internal: { failed: failed.map(c => c.name) } })
    }

    s?.stop('Done')

    const payload = { checks, passed: checks.length, failed: 0 }
    log.set({ result: payload })

    if (args.json) {
      console.log(JSON.stringify(payload))
    } else {
      p.outro(`All ${checks.length} checks passed`)
    }
  },
})
