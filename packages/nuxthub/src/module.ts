import { existsSync, promises as fsp } from 'node:fs'
import { resolve } from 'node:path'
import { addServerHandler, addServerPlugin, addTypeTemplate, createResolver, defineNuxtModule, hasNuxtModule, installModule } from '@nuxt/kit'
import { consola } from 'consola'
import type { NitroConfig } from 'nitropack'
import { name, version } from '../package.json'
import { retentionToCron } from './runtime/utils/retention'

export default defineNuxtModule({
  meta: {
    name,
    version,
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
    const retention = evlogConfig.retention ?? '7d'
    const cron = retentionToCron(retention)

    const crons: Array<{ path: string, schedule: string }> = config.crons || []
    const existing = crons.findIndex(c => c.path === '/api/_cron/evlog-cleanup')
    if (existing >= 0) {
      crons[existing]!.schedule = cron
    } else {
      crons.push({ path: '/api/_cron/evlog-cleanup', schedule: cron })
    }
    config.crons = crons

    await fsp.writeFile(vercelJsonPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8')
    consola.success('Created vercel.json with evlog cleanup cron schedule')
  },
  async setup(_moduleOptions, nuxt) {
    const { resolve } = createResolver(import.meta.url)

    // Auto-install evlog/nuxt and @nuxthub/core if not already registered
    if (!hasNuxtModule('evlog/nuxt')) {
      await installModule('evlog/nuxt')
    }
    if (!hasNuxtModule('@nuxthub/core')) {
      await installModule('@nuxthub/core')
    }

    // Augment evlog/nuxt ModuleOptions with retention (not yet in published evlog)
    addTypeTemplate({
      filename: 'types/evlog-nuxthub.d.ts',
      getContents: () => [
        'declare module \'evlog/nuxt\' {',
        '  interface ModuleOptions {',
        '    retention?: string',
        '  }',
        '}',
        'export {}',
      ].join('\n'),
    })

    // Read nuxthub options from evlog config key
    const evlogConfig = (nuxt.options as any).evlog || {}
    const retention: string = evlogConfig.retention ?? '7d'

    // Extend NuxtHub DB schema with dialect-specific evlog_events table
    // @ts-expect-error hub:db:schema:extend hook exists but is not in NuxtHooks type
    nuxt.hook('hub:db:schema:extend', ({ dialect, paths }: { dialect: string, paths: string[] }) => {
      paths.push(resolve(`./runtime/db/schema/events.${dialect}`))
    })

    // Register the drain server plugin (resolved from dist/runtime/)
    addServerPlugin(resolve('./runtime/drain'))

    // Register the cron API route (works as Vercel cron target or manual trigger)
    addServerHandler({
      route: '/api/_cron/evlog-cleanup',
      handler: resolve('./runtime/api/_cron/evlog-cleanup'),
    })

    // Register the cleanup task with automatic cron schedule based on retention
    nuxt.hook('nitro:config', (nitroConfig: NitroConfig) => {
      // Enable experimental tasks
      nitroConfig.experimental = nitroConfig.experimental || {}
      nitroConfig.experimental.tasks = true

      // Register the task handler
      nitroConfig.tasks = nitroConfig.tasks || {}
      nitroConfig.tasks['evlog:cleanup'] = {
        handler: resolve('./runtime/tasks/evlog-cleanup'),
      }

      // Schedule based on retention (e.g., 1m → every 1 min, 1h → every 30 min, 30d → daily 3AM)
      const cron = retentionToCron(retention)
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
