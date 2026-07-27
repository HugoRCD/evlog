import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createContext } from '../src/core/context'
import type { CliContext } from '../src/core/context'
import { planWiring } from '../src/lib/init/frameworks'
import { detectPackageManager, installCommand } from '../src/lib/init/pm'
import { runInit } from '../src/lib/init/run'

const tempDirs: string[] = []

async function project(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'evlog-cli-init-'))
  tempDirs.push(dir)
  for (const [path, contents] of Object.entries(files)) {
    const target = join(dir, path)
    await mkdir(join(target, '..'), { recursive: true })
    await writeFile(target, contents, 'utf8')
  }
  return dir
}

function fakeContext(cwd: string): CliContext {
  return createContext({ cwd, env: {}, nodeVersion: 'v22.0.0', tty: false, color: false, columns: 80 })
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('planWiring — nuxt', () => {
  it('appends to an existing modules array without touching anything else', async () => {
    const root = await project({
      'package.json': '{"name":"shop"}',
      'nuxt.config.ts': `export default defineNuxtConfig({\n  // keep me\n  modules: ['@nuxt/ui'],\n  devtools: { enabled: true },\n})\n`,
    })

    const plan = planWiring({ root, framework: 'nuxt', service: 'shop', drain: 'none', extras: [], nitroMajor: 3 })

    expect(plan.actions).toHaveLength(1)
    expect(plan.actions[0]!.contents).toBe(
      `export default defineNuxtConfig({\n  // keep me\n  modules: ['@nuxt/ui', 'evlog/nuxt'],\n  devtools: { enabled: true },\n  evlog: {\n    env: { service: 'shop' },\n  },\n})\n`,
    )
  })

  it('adds the modules key when the config has none', async () => {
    const root = await project({
      'package.json': '{"name":"shop"}',
      'nuxt.config.ts': `export default defineNuxtConfig({\n  devtools: { enabled: true },\n})\n`,
    })

    const { contents } = (planWiring({ root, framework: 'nuxt', service: 'shop', drain: 'none', extras: [], nitroMajor: 3 }).actions[0]!)

    expect(contents).toContain(`modules: ['evlog/nuxt'],`)
    expect(contents).toContain(`env: { service: 'shop' },`)
  })

  it('plans nothing when the module is already registered', async () => {
    const root = await project({
      'package.json': '{"name":"shop"}',
      'nuxt.config.ts': `export default defineNuxtConfig({\n  modules: ['evlog/nuxt'],\n  evlog: { env: { service: 'shop' } },\n})\n`,
    })

    const plan = planWiring({ root, framework: 'nuxt', service: 'shop', drain: 'none', extras: [], nitroMajor: 3 })

    expect(plan.actions).toHaveLength(0)
    expect(plan.already).toHaveLength(2)
  })

  it('hands back a snippet rather than guessing at a computed modules list', async () => {
    const root = await project({
      'package.json': '{"name":"shop"}',
      'nuxt.config.ts': `const mods = ['@nuxt/ui']\nexport default defineNuxtConfig({\n  modules: mods,\n})\n`,
    })

    const plan = planWiring({ root, framework: 'nuxt', service: 'shop', drain: 'none', extras: [], nitroMajor: 3 })

    expect(plan.manual[0]).toMatchObject({ file: 'nuxt.config.ts', snippet: `'evlog/nuxt'` })
    /* The half it can still do lands: the `evlog` block is independent of how
       `modules` is spelled, and skipping it would make the manual step longer
       than it has to be. */
    expect(plan.actions[0]!.contents).toContain(`env: { service: 'shop' },`)
    expect(plan.actions[0]!.contents).toContain('modules: mods')
  })
})

describe('planWiring — nitro', () => {
  it('adds the import alongside the module entry', async () => {
    const root = await project({
      'package.json': '{"name":"api"}',
      'nitro.config.ts': `import { defineConfig } from 'nitro'\n\nexport default defineConfig({\n  compatibilityDate: '2025-01-01',\n})\n`,
    })

    const { contents } = (planWiring({ root, framework: 'nitro', service: 'api', drain: 'none', extras: [], nitroMajor: 3 }).actions[0]!)

    expect(contents).toContain(`import evlog from 'evlog/nitro/v3'`)
    expect(contents).toContain(`env: { service: 'api' },`)
  })

  it('uses the v2 subpath and factory when the project is on nitropack', async () => {
    const root = await project({ 'package.json': '{"name":"api"}' })

    const { contents } = (planWiring({ root, framework: 'nitro', service: 'api', drain: 'none', extras: [], nitroMajor: 2 }).actions[0]!)

    expect(contents).toContain(`import evlog from 'evlog/nitro'`)
    expect(contents).toContain('defineNitroConfig')
  })

  it('turns on async context for tanstack start and asks for the error middleware', async () => {
    const root = await project({
      'package.json': '{"name":"start-app"}',
      'nitro.config.ts': `import { defineConfig } from 'nitro'\n\nexport default defineConfig({\n  experimental: {},\n})\n`,
    })

    const plan = planWiring({ root, framework: 'tanstack-start', service: 'start-app', drain: 'none', extras: [], nitroMajor: 3 })

    expect(plan.actions[0]!.contents).toContain('asyncContext: true')
    expect(plan.manual[0]!.snippet).toContain('evlogErrorHandler')
  })
})

describe('planWiring — next', () => {
  it('writes instrumentation next to the app directory, not at the root', async () => {
    const root = await project({
      'package.json': '{"name":"web"}',
      'src/app/page.tsx': 'export default function Page() { return null }',
    })

    const files = planWiring({ root, framework: 'next', service: 'web', drain: 'fs', extras: [], nitroMajor: 3 }).actions.map(a => a.relative)

    expect(files).toEqual([join('src', 'instrumentation.ts'), join('src', 'lib', 'evlog.ts')])
  })

  it('leaves an existing instrumentation file alone', async () => {
    const root = await project({
      'package.json': '{"name":"web"}',
      'instrumentation.ts': 'export function register() {}',
    })

    const plan = planWiring({ root, framework: 'next', service: 'web', drain: 'none', extras: [], nitroMajor: 3 })

    expect(plan.actions.map(a => a.relative)).toEqual([join('lib', 'evlog.ts')])
    expect(plan.already).toContain('instrumentation.ts already exists')
  })
})

describe('runInit', () => {
  it('writes nothing under dry run and reports what it would do', async () => {
    const cwd = await project({
      'package.json': '{"name":"@acme/shop","dependencies":{"nuxt":"^4.0.0"}}',
      'nuxt.config.ts': 'export default defineNuxtConfig({})\n',
    })

    const result = await runInit(fakeContext(cwd), undefined, { dryRun: true, yes: true })

    expect(result.answers.framework).toBe('nuxt')
    /* The scope is noise once every event carries the service name. */
    expect(result.answers.service).toBe('shop')
    expect(result.written.length).toBeGreaterThan(0)
    expect(await readFile(join(cwd, 'nuxt.config.ts'), 'utf8')).toBe('export default defineNuxtConfig({})\n')
    expect(existsSync(join(cwd, 'server/plugins/evlog-drain.ts'))).toBe(false)
  })

  it('is safe to run twice — the second run changes nothing', async () => {
    const cwd = await project({
      'package.json': '{"name":"shop","dependencies":{"nuxt":"^4.0.0"}}',
      'nuxt.config.ts': 'export default defineNuxtConfig({})\n',
    })

    await runInit(fakeContext(cwd), undefined, { install: false, yes: true })
    const afterFirst = await readFile(join(cwd, 'nuxt.config.ts'), 'utf8')
    const second = await runInit(fakeContext(cwd), undefined, { install: false, yes: true })

    expect(second.written).toHaveLength(0)
    expect(await readFile(join(cwd, 'nuxt.config.ts'), 'utf8')).toBe(afterFirst)
  })

  it('gates the local sink on development rather than shipping a file writer', async () => {
    const cwd = await project({
      'package.json': '{"name":"shop","dependencies":{"nuxt":"^4.0.0"}}',
      'nuxt.config.ts': 'export default defineNuxtConfig({})\n',
    })

    await runInit(fakeContext(cwd), undefined, { install: false, yes: true })

    const plugin = await readFile(join(cwd, 'server/plugins/evlog-drain.ts'), 'utf8')
    expect(plugin).toContain('if (!import.meta.dev) return')
    expect(plugin).toContain('createFsDrain')
  })

  it('honours --no-sink', async () => {
    const cwd = await project({
      'package.json': '{"name":"shop","dependencies":{"nuxt":"^4.0.0"}}',
      'nuxt.config.ts': 'export default defineNuxtConfig({})\n',
    })

    await runInit(fakeContext(cwd), undefined, { install: false, drain: 'none', yes: true })

    expect(existsSync(join(cwd, 'server/plugins/evlog-drain.ts'))).toBe(false)
  })

  it('reports the install command without running it when told not to', async () => {
    const cwd = await project({
      'package.json': '{"name":"shop","dependencies":{"nuxt":"^4.0.0"}}',
      'pnpm-lock.yaml': '',
      'nuxt.config.ts': 'export default defineNuxtConfig({})\n',
    })

    const result = await runInit(fakeContext(cwd), undefined, { install: false, yes: true })

    expect(result.install).toMatchObject({ status: 'skipped', command: 'pnpm add evlog' })
  })
})

describe('detectPackageManager', () => {
  it('reads the lockfile nearest the package first', async () => {
    const root = await project({ 'package.json': '{}', 'bun.lock': '' })

    expect(detectPackageManager([root])).toBe('bun')
  })

  it('falls back to npm when nothing says otherwise', async () => {
    const root = await project({ 'package.json': '{}' })

    expect(detectPackageManager([root])).toBe('npm')
    expect(installCommand('npm')).toBe('npm install evlog')
  })
})

describe('drain wiring', () => {
  it('leaves a hosted drain running in production', async () => {
    const root = await project({ 'package.json': '{"name":"api"}' })

    const plan = planWiring({ root, framework: 'nitro', service: 'api', drain: 'axiom', extras: [], nitroMajor: 3 })
    const drain = plan.actions.find(action => action.relative.endsWith('evlog-drain.ts'))!

    expect(drain.contents).toContain(`import { createAxiomDrain } from 'evlog/axiom'`)
    expect(drain.contents).not.toContain('import.meta.dev')
  })

  it('scopes the filesystem drain to development', async () => {
    /* It writes files on whatever box serves the request — that is a decision,
       and init does not make it for you. */
    const root = await project({ 'package.json': '{"name":"api"}' })

    const plan = planWiring({ root, framework: 'nitro', service: 'api', drain: 'fs', extras: [], nitroMajor: 3 })
    const drain = plan.actions.find(action => action.relative.endsWith('evlog-drain.ts'))!

    expect(drain.contents).toContain('if (!import.meta.dev) return')
  })

  it('writes no drain plugin at all for the console-only choice', async () => {
    const root = await project({ 'package.json': '{"name":"api"}' })

    const plan = planWiring({ root, framework: 'nitro', service: 'api', drain: 'none', extras: [], nitroMajor: 3 })

    expect(plan.actions.some(action => action.relative.includes('evlog-drain'))).toBe(false)
  })

  it('wraps the drain in a pipeline when batching was asked for', async () => {
    const root = await project({ 'package.json': '{"name":"api"}' })

    const plan = planWiring({ root, framework: 'nitro', service: 'api', drain: 'axiom', extras: ['pipeline'], nitroMajor: 3 })
    const drain = plan.actions.find(action => action.relative.endsWith('evlog-drain.ts'))!

    expect(drain.contents).toContain('createDrainPipeline<DrainContext>')
    expect(drain.contents).toContain('pipeline(createAxiomDrain())')
  })

  it('puts the Next.js drain in the factory rather than a plugin', async () => {
    const root = await project({ 'package.json': '{"name":"web"}' })

    const plan = planWiring({ root, framework: 'next', service: 'web', drain: 'sentry', extras: [], nitroMajor: 3 })
    const lib = plan.actions.find(action => action.relative.endsWith('evlog.ts'))!

    expect(lib.contents).toContain(`import { createSentryDrain } from 'evlog/sentry'`)
    expect(lib.contents).toContain('drain: createSentryDrain(),')
  })

  it('keeps errors at full rate when sampling is enabled', async () => {
    const root = await project({
      'package.json': '{"name":"shop"}',
      'nuxt.config.ts': 'export default defineNuxtConfig({})\n',
    })

    const plan = planWiring({ root, framework: 'nuxt', service: 'shop', drain: 'fs', extras: ['sampling'], nitroMajor: 3 })
    const config = plan.actions.find(action => action.relative === 'nuxt.config.ts')!

    expect(config.contents).toContain('error: 100')
  })
})
