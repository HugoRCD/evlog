import { defineCommand } from 'citty'
import * as p from '@clack/prompts'
import { useLogger } from '@evlog/cli'
import { resolveCliActor } from '../catalogs/actor'
import { auditCatalog } from '../catalogs/audit'
import { errorCatalog } from '../catalogs/errors'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const pull = defineCommand({
  meta: {
    name: 'pull',
    description: 'Fake secret pull with audit + redacted token flag',
  },
  args: {
    token: {
      type: 'string',
      description: 'API token (redacted in logs)',
    },
    env: {
      type: 'string',
      description: 'Target environment',
      default: 'staging',
    },
    json: {
      type: 'boolean',
      description: 'Machine-readable stdout (app contract)',
    },
  },
  async run({ args }) {
    const log = useLogger()
    const actor = resolveCliActor()

    if (!args.env) {
      throw errorCatalog.CONFIG_MISSING()
    }

    if (!args.token) {
      log.audit.deny('Missing API token', auditCatalog.SECRET_PULL({
        actor,
        target: { id: args.env, env: args.env, access: 'read' },
      }))
      throw errorCatalog.AUTH_TOKEN_REQUIRED()
    }

    const s = args.json ? null : p.spinner()
    s?.start(`Pulling secrets for ${args.env}`)
    await sleep(120)

    const keys = ['DATABASE_URL', 'API_KEY', 'SIGNING_SECRET']
    log.set({
      secrets: { env: args.env, keyCount: keys.length, keys },
      flags: { token: args.token },
    })

    log.audit(auditCatalog.SECRET_PULL({
      actor,
      target: {
        id: args.env,
        env: args.env,
        resource: 'secrets',
        access: 'read',
      },
      outcome: 'success',
      changes: {
        after: { env: args.env, keyCount: keys.length, keys },
      },
    }))

    s?.stop('Secrets pulled')

    const payload = { env: args.env, keyCount: keys.length }
    if (args.json) {
      console.log(JSON.stringify(payload))
    } else {
      p.log.success(`Pulled ${keys.length} secrets for ${args.env}`)
    }
  },
})
