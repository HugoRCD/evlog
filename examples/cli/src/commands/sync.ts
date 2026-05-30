import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import { useLogger } from '@evlog/cli'
import { createOutboundHooks } from '@evlog/cli/http'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Medium — wide event + outbound HTTP hooks, no audit catalog. */
export const sync = defineCommand({
  meta: {
    name: 'sync',
    description: 'Fake sync with outbound HTTP hooks on the wide event',
  },
  args: {
    records: {
      type: 'positional',
      description: 'Number of records to sync',
      default: '5',
    },
    json: {
      type: 'boolean',
      description: 'Machine-readable stdout (app contract)',
    },
  },
  async run({ args }) {
    const log = useLogger()
    const count = Number(args.records) || 5
    const hooks = createOutboundHooks(log)
    const source = 'https://api.example.com'

    if (!args.json) {
      p.log.info(`Syncing ${count} records…`)
    }

    for (let i = 1; i <= count; i++) {
      await hooks.onRequest?.({
        request: `/records/${i}`,
        options: { method: 'GET', baseURL: source },
      })
      await hooks.onResponse?.({
        request: `/records/${i}`,
        options: { method: 'GET', baseURL: source },
        response: new Response(JSON.stringify({ id: i }), { status: 200 }),
      })

      await sleep(30)
      log.set({ sync: { processed: i, total: count } })
    }

    const payload = { processed: count, source }
    if (args.json) {
      console.log(JSON.stringify(payload))
    } else {
      p.log.success(`Synced ${count} records`)
    }
  },
})
