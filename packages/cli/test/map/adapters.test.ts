import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getAdapter } from '../../src/lib/map/adapters/index'
import type { Framework, RawRouteEntry, ScanContext } from '../../src/lib/map/types'

const tempDirs: string[] = []

/** Write a throwaway project from a path → source map, and return its root. */
async function project(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'evlog-cli-adapter-'))
  tempDirs.push(root)
  for (const [path, source] of Object.entries(files)) {
    const file = join(root, path)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, source, 'utf8')
  }
  return root
}

function routesOf(framework: Framework, root: string): Promise<RawRouteEntry[]> {
  const ctx: ScanContext = {
    projectRoot: root,
    framework,
    projectName: 'temp',
    hasEvlog: true,
    verbose: false,
  }
  return getAdapter(framework).extractRoutes(ctx)
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('next adapter', () => {
  it('finds routes in src/app when the project has no pages at all', async () => {
    const root = await project({
      'src/app/api/health/route.ts': 'export function GET() { return Response.json({ ok: true }) }',
    })

    const routes = await routesOf('next', root)

    expect(routes.map(route => `${route.method} ${route.path}`)).toEqual(['GET /api/health'])
  })

  it('gives the root handler the root path', async () => {
    const root = await project({
      'app/route.ts': 'export function GET() { return new Response("hi") }',
    })

    const routes = await routesOf('next', root)

    expect(routes[0]?.path).toBe('/')
  })

  it('reads a method exported under an alias', async () => {
    const root = await project({
      'app/api/orders/route.ts': [
        'async function handler() { return Response.json([]) }',
        'export { handler as GET }',
      ].join('\n'),
    })

    const routes = await routesOf('next', root)

    expect(routes.map(route => route.method)).toEqual(['GET'])
  })

  it('still collects server actions once the cheap text filter is in the way', async () => {
    const root = await project({
      'app/actions/orders.ts': [
        '"use server"',
        'export async function createOrder() { return { id: 1 } }',
      ].join('\n'),
      'app/lib/plain.ts': 'export function helper() { return 1 }',
    })

    const routes = await routesOf('next', root)

    expect(routes.map(route => route.path)).toEqual(['action:createOrder'])
  })
})

describe('tanstack-start adapter', () => {
  it('does not read "api" inside a longer word as an API route', async () => {
    const root = await project({
      'src/routes/capital.tsx': 'export const Route = createFileRoute("/capital")({})',
    })

    const routes = await routesOf('tanstack-start', root)

    expect(routes.map(route => route.kind)).toEqual(['page'])
  })

  it('ignores lowercase method-shaped properties', async () => {
    const root = await project({
      'src/routes/settings.tsx': [
        'const form = { get: () => null, delete: () => null }',
        'export const Route = createFileRoute("/settings")({ component: () => form })',
      ].join('\n'),
    })

    const routes = await routesOf('tanstack-start', root)

    expect(routes.map(route => `${route.kind} ${route.method ?? '*'}`)).toEqual(['page *'])
  })

  it('reads the uppercase handlers the framework actually honours', async () => {
    const root = await project({
      'src/routes/api/orders.ts': [
        'export const Route = createFileRoute("/api/orders")({',
        '  server: { handlers: { GET: async () => null, POST: async () => null } },',
        '})',
      ].join('\n'),
    })

    const routes = await routesOf('tanstack-start', root)

    expect(routes.map(route => route.method).sort()).toEqual(['GET', 'POST'])
  })
})
