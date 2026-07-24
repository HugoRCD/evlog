import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getAdapter } from '../../src/lib/map/adapters/index'
import { detectFramework } from '../../src/lib/map/detect'
import { scan } from '../../src/lib/map/scan'
import type { ScanContext } from '../../src/lib/map/types'
import { extractMethodFromFilename, segmentsToPath } from '../../src/lib/map/utils'
import { mapForSnapshot } from '../../src/lib/map/write'
import { resolveProject } from '../../src/lib/project'

const FIXTURES = join(import.meta.dirname, 'fixtures')

async function ctx(root: string, framework: ScanContext['framework']): Promise<ScanContext> {
  const project = await resolveProject(root)
  const deps = { ...project.packageJson?.dependencies, ...project.packageJson?.devDependencies }
  return {
    projectRoot: project.packageDir,
    framework,
    projectName: project.packageName ?? 'unknown',
    hasEvlog: 'evlog' in deps,
    verbose: false,
  }
}

describe('utils', () => {
  it('extracts HTTP method from filename', () => {
    expect(extractMethodFromFilename('checkout.post.ts')).toBe('POST')
    expect(extractMethodFromFilename('health.get.ts')).toBe('GET')
    expect(extractMethodFromFilename('index.ts')).toBeNull()
  })

  it('converts segments to path', () => {
    expect(segmentsToPath(['orders', '[id]'], '/api')).toBe('/api/orders/:id')
    expect(segmentsToPath(['docs', '[...slug]'], '/api')).toBe('/api/docs/:slug*')
    expect(segmentsToPath(['(group)', 'about'])).toBe('/about')
  })
})

describe('detect', () => {
  it('detects nuxt in fixture', async () => {
    const project = await resolveProject(join(FIXTURES, 'nuxt-basic'))
    const result = detectFramework(project)
    expect(result.framework).toBe('nuxt')
  })

  it('detects next in fixture', async () => {
    const project = await resolveProject(join(FIXTURES, 'next-app-router'))
    const result = detectFramework(project)
    expect(result.framework).toBe('next')
  })

  it('detects tanstack-start in fixture', async () => {
    const project = await resolveProject(join(FIXTURES, 'tanstack-basic'))
    const result = detectFramework(project)
    expect(result.framework).toBe('tanstack-start')
  })
})

describe('nuxt extraction', () => {
  it('extracts all routes from nuxt-basic fixture', async () => {
    const root = join(FIXTURES, 'nuxt-basic')
    const adapter = getAdapter('nuxt')
    const routes = await adapter.extractRoutes(await ctx(root, 'nuxt'))

    const paths = routes.map(r => `${r.method ?? '*'} ${r.path} (${r.kind})`).sort()
    expect(paths).toMatchInlineSnapshot(`
      [
        "* * (middleware)",
        "* / (page)",
        "* /orders/:id (page)",
        "* /tasks/cleanup (cron)",
        "GET /api/broken-error (api)",
        "GET /api/docs/:slug* (api)",
        "GET /api/orders/:id (api)",
        "GET /api/plain-error (api)",
        "GET /health (api)",
        "POST /api/checkout (api)",
        "POST /api/payments/stripe (api)",
      ]
    `)
  })
})

describe('next extraction', () => {
  it('extracts all routes from next-app-router fixture', async () => {
    const root = join(FIXTURES, 'next-app-router')
    const adapter = getAdapter('next')
    const routes = await adapter.extractRoutes(await ctx(root, 'next'))

    const paths = routes.map(r => `${r.method ?? '*'} ${r.path} (${r.kind})`).sort()
    expect(paths).toContain('GET /api/health (api)')
    expect(paths).toContain('POST /api/checkout (api)')
    expect(paths).toContain('POST /api/payments (api)')
    expect(paths).toContain('GET /api/error (api)')
    expect(paths).toContain('* / (page)')
    expect(paths).toContain('POST action:createOrder (server-action)')
    expect(paths).toContain('* * (middleware)')
  })
})

describe('tanstack extraction', () => {
  it('extracts routes from tanstack-basic fixture', async () => {
    const root = join(FIXTURES, 'tanstack-basic')
    const adapter = getAdapter('tanstack-start')
    const routes = await adapter.extractRoutes(await ctx(root, 'tanstack-start'))

    const paths = routes.map(r => `${r.method ?? '*'} ${r.path} (${r.kind})`).sort()
    expect(paths).toContain('POST /api/checkout (api)')
    expect(paths).toContain('GET /api/hello (api)')
    expect(paths).toContain('* / (page)')
    expect(paths).toContain('POST /api/admin (api)')
  })
})

describe('full scan snapshots', () => {
  it('nuxt-basic map snapshot', async () => {
    const root = join(FIXTURES, 'nuxt-basic')
    const result = await scan(await ctx(root, 'nuxt'))
    expect(mapForSnapshot(result.map)).toMatchSnapshot()
  })

  it('next-app-router map snapshot', async () => {
    const root = join(FIXTURES, 'next-app-router')
    const result = await scan(await ctx(root, 'next'))
    expect(mapForSnapshot(result.map)).toMatchSnapshot()
  })

  it('tanstack-basic map snapshot', async () => {
    const root = join(FIXTURES, 'tanstack-basic')
    const result = await scan(await ctx(root, 'tanstack-start'))
    expect(mapForSnapshot(result.map)).toMatchSnapshot()
  })
})

describe('checks', () => {
  it('flags empty catch blocks', async () => {
    const root = join(FIXTURES, 'nuxt-basic')
    const result = await scan(await ctx(root, 'nuxt'))
    const stripe = result.map.routes.find(r => r.path === '/api/payments/stripe')
    expect(stripe?.checks['error-handling']?.status).toBe('fail')
  })

  it('passes instrumented checkout route', async () => {
    const root = join(FIXTURES, 'nuxt-basic')
    const result = await scan(await ctx(root, 'nuxt'))
    const checkout = result.map.routes.find(r => r.path === '/api/checkout')
    expect(checkout?.checks['wide-event']?.status).toBe('pass')
    expect(checkout?.checks['context']?.status).toBe('pass')
    expect(checkout?.checks['audit']?.status).toBe('pass')
    expect(checkout?.score).toBe(100)
  })

  it('flags createError missing fix', async () => {
    const root = join(FIXTURES, 'nuxt-basic')
    const result = await scan(await ctx(root, 'nuxt'))
    const broken = result.map.routes.find(r => r.path === '/api/broken-error')
    expect(broken?.checks['structured-errors']?.status).toBe('fail')
  })

  it('flags plain throw new Error', async () => {
    const root = join(FIXTURES, 'nuxt-basic')
    const result = await scan(await ctx(root, 'nuxt'))
    const plain = result.map.routes.find(r => r.path === '/api/plain-error')
    expect(plain?.checks['structured-errors']?.status).toBe('fail')
  })
})
