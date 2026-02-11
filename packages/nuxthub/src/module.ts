import { existsSync, promises as fsp } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { addServerHandler, addServerPlugin, defineNuxtModule } from '@nuxt/kit'
import { consola } from 'consola'
import type { NitroConfig } from 'nitropack'
import { createEvlogError } from 'evlog'

export interface ModuleOptions {
  /**
   * How long to retain events before cleanup.
   * Supports "30d" (days), "24h" (hours), "60m" (minutes).
   * @default '30d'
   */
  retention?: string
}

function retentionToCron(retention: string): string {
  const match = retention.match(/^(\d+)(d|h|m)$/)
  if (!match) {
    throw createEvlogError({
      message: `[evlog/nuxthub] Invalid retention format: "${retention}"`,
      why: 'The retention value must be a number followed by a unit: d (days), h (hours), or m (minutes)',
      fix: `Change retention to a valid format, e.g., "30d", "24h", or "60m"`,
      link: 'https://evlog.dev/nuxthub/retention',
    })
  }

  const [, numStr, unit] = match
  const num = Number(numStr)

  // Convert retention to minutes
  let totalMinutes: number
  switch (unit) {
    case 'm':
      totalMinutes = num
      break
    case 'h':
      totalMinutes = num * 60
      break
    case 'd':
      totalMinutes = num * 24 * 60
      break
    default:
      throw createEvlogError({
        message: `[evlog/nuxthub] Unknown retention unit: "${unit}"`,
        why: 'The retention value must use one of the supported units: d (days), h (hours), or m (minutes)',
        fix: `Change retention to a valid format, e.g., "30d", "24h", or "60m"`,
        link: 'https://evlog.dev/nuxthub/retention',
      })
  }

  // Cleanup runs every half-retention period
  const halfMinutes = Math.max(1, Math.floor(totalMinutes / 2))

  if (halfMinutes < 60) {
    return `*/${halfMinutes} * * * *`
  }

  const halfHours = Math.floor(halfMinutes / 60)
  if (halfHours >= 24) {
    return '0 3 * * *'
  }

  return `0 */${halfHours} * * *`
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@evlog/nuxthub',
    version: '0.0.1-alpha.1',
  },
  moduleDependencies: {
    'evlog/nuxt': {},
  },
  async onInstall(nuxt) {
    const shouldSetup = await consola.prompt(
      'Do you want to create a vercel.json with a cron schedule for evlog cleanup?',
      { type: 'confirm', initial: false },
    )
    if (typeof shouldSetup !== 'boolean' || !shouldSetup) return

    const vercelJsonPath = resolve(nuxt.options.rootDir, 'vercel.json')
    let config: Record<string, any> = {}
    if (existsSync(vercelJsonPath)) {
      config = JSON.parse(await fsp.readFile(vercelJsonPath, 'utf-8'))
    }

    const evlogConfig = (nuxt.options as any).evlog || {}
    const retention = evlogConfig.retention ?? '30d'
    const cron = retentionToCron(retention)

    const crons: Array<{ path: string, schedule: string }> = config.crons || []
    const existing = crons.findIndex(c => c.path === '/api/_cron/evlog-cleanup')
    if (existing >= 0) {
      crons[existing].schedule = cron
    } else {
      crons.push({ path: '/api/_cron/evlog-cleanup', schedule: cron })
    }
    config.crons = crons

    await fsp.writeFile(vercelJsonPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8')
    consola.success('Created vercel.json with evlog cleanup cron schedule')
  },
  setup(_moduleOptions, nuxt) {
    // Read nuxthub options from evlog config key
    const evlogConfig = (nuxt.options as any).evlog || {}
    const options: Required<ModuleOptions> = {
      retention: evlogConfig.retention ?? '30d',
    }

    // Runtime files must be resolved from src/ so Nitro can bundle them
    // and resolve virtual imports like @nuxthub/db
    const distDir = fileURLToPath(new URL('.', import.meta.url))
    const srcDir = resolve(distDir, '..', 'src')
    const runtimeDir = join(srcDir, 'runtime')

    // Extend NuxtHub DB schema with dialect-specific evlog_events table
    // @ts-expect-error hub:db:schema:extend hook exists but is not in NuxtHooks type
    nuxt.hook('hub:db:schema:extend', ({ paths, dialect }: { paths: string[], dialect: string }) => {
      paths.push(resolve(srcDir, 'schema', `${dialect}.ts`))
    })

    // Register the drain server plugin
    addServerPlugin(join(runtimeDir, 'drain'))

    // Register the cron API route (works as Vercel cron target or manual trigger)
    addServerHandler({
      route: '/api/_cron/evlog-cleanup',
      handler: join(runtimeDir, 'api', '_cron', 'evlog-cleanup'),
    })

    // Register the cleanup task with automatic cron schedule based on retention
    // @ts-expect-error nitro:config hook exists but is not in NuxtHooks type
    nuxt.hook('nitro:config', (nitroConfig: NitroConfig) => {
      // Enable experimental tasks
      nitroConfig.experimental = nitroConfig.experimental || {}
      nitroConfig.experimental.tasks = true

      // Register the task handler
      nitroConfig.tasks = nitroConfig.tasks || {}
      nitroConfig.tasks['evlog:cleanup'] = {
        handler: join(runtimeDir, 'tasks', 'evlog-cleanup'),
      }

      // Schedule based on retention (e.g., 1m → every 1 min, 1h → every 30 min, 30d → daily 3AM)
      const cron = retentionToCron(options.retention!)
      nitroConfig.scheduledTasks = nitroConfig.scheduledTasks || {}
      const existing = nitroConfig.scheduledTasks[cron]
      if (Array.isArray(existing)) {
        existing.push('evlog:cleanup')
      } else if (existing) {
        nitroConfig.scheduledTasks[cron] = [existing, 'evlog:cleanup']
      } else {
        nitroConfig.scheduledTasks[cron] = ['evlog:cleanup']
      }
    })
  },
})
