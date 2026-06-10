import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import { useLogger } from '@evlog/cli'
import { resolveCliActor } from '../catalogs/actor'
import { auditCatalog } from '../catalogs/audit'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const deploy = defineCommand({
  meta: {
    name: 'deploy',
    description: 'Fake deploy with phased wide-event context',
  },
  args: {
    region: {
      type: 'string',
      description: 'Deploy region',
      default: 'eu-west-1',
    },
    json: {
      type: 'boolean',
      description: 'Machine-readable stdout (app contract)',
    },
  },
  async run({ args }) {
    const log = useLogger()
    const actor = resolveCliActor()

    if (!args.json) {
      p.intro(`Deploying to ${args.region}`)
    }

    const build = args.json ? null : p.spinner()
    build?.start('Building')
    log.set({ phase: 'build' })
    await sleep(60)
    build?.stop('Build complete')

    const rollout = args.json ? null : p.spinner()
    rollout?.start('Rolling out')
    log.set({ phase: 'rollout', region: args.region })
    await sleep(80)
    rollout?.stop('Rollout complete')

    const instances = 3
    log.set({ phase: 'complete', region: args.region, instances })

    log.audit(auditCatalog.DEPLOY({
      actor,
      target: {
        id: `deploy-${args.region}`,
        region: args.region,
        resource: 'deployment',
      },
      outcome: 'success',
      changes: {
        before: { phase: 'pending', instances: 0 },
        after: { phase: 'complete', region: args.region, instances },
      },
    }))

    const payload = { region: args.region, instances }
    if (args.json) {
      console.log(JSON.stringify(payload))
    } else {
      p.outro(`Deployed to ${args.region}`)
    }
  },
})
