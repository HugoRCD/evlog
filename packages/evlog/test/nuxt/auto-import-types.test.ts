import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Nuxt } from '@nuxt/schema'
import { defined } from '../helpers/defined'

const addImports = vi.hoisted(() => vi.fn())
const addServerImports = vi.hoisted(() => vi.fn())
const addPlugin = vi.hoisted(() => vi.fn())
const addServerHandler = vi.hoisted(() => vi.fn())
const addServerPlugin = vi.hoisted(() => vi.fn())
const addVitePlugin = vi.hoisted(() => vi.fn())

vi.mock('@nuxt/kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nuxt/kit')>()
  return {
    ...actual,
    defineNuxtModule: <T>(definition: T) => definition,
    createResolver: () => ({
      resolve: (path: string) => `/resolved/${path.replace(/^\.\.\//, '')}`,
    }),
    addImports,
    addServerImports,
    addPlugin,
    addServerHandler,
    addServerPlugin,
    addVitePlugin,
  }
})

vi.mock('../../src/vite/strip', () => ({
  createStripPlugin: vi.fn(() => ({ name: 'evlog:strip' })),
}))

vi.mock('../../src/vite/source-location', () => ({
  createSourceLocationPlugin: vi.fn(() => ({ name: 'evlog:source-location' })),
}))

interface NuxtModuleDefinition {
  setup: (options: Record<string, unknown>, nuxt: Nuxt) => void
}

describe('nuxt module auto-import types (#407)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets typeFrom so Nuxt generates package-entrypoint types instead of dist paths', async () => {
    const module = (await import('../../src/nuxt/module')).default as unknown as NuxtModuleDefinition

    const nuxt = {
      options: {
        dev: false,
        runtimeConfig: {
          public: {},
        },
      },
      hook: vi.fn(),
    } as unknown as Nuxt

    module.setup({}, nuxt)

    expect(addImports).toHaveBeenCalledTimes(1)
    expect(addServerImports).toHaveBeenCalledTimes(1)

    const clientImports = defined(addImports.mock.calls[0]?.[0], 'client imports') as Array<{
      name: string
      from: string
      typeFrom?: string
    }>
    const serverImports = defined(addServerImports.mock.calls[0]?.[0], 'server imports') as Array<{
      name: string
      from: string
      typeFrom?: string
    }>

    expect(clientImports).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'log', typeFrom: 'evlog/client' }),
      expect.objectContaining({ name: 'setIdentity', typeFrom: 'evlog/client' }),
      expect.objectContaining({ name: 'clearIdentity', typeFrom: 'evlog/client' }),
      expect.objectContaining({ name: 'setMinLevel', typeFrom: 'evlog/client' }),
      expect.objectContaining({ name: 'createEvlogError', typeFrom: 'evlog' }),
      expect.objectContaining({ name: 'parseError', typeFrom: 'evlog' }),
    ]))

    expect(serverImports).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'useLogger', typeFrom: 'evlog' }),
      expect.objectContaining({ name: 'log', typeFrom: 'evlog' }),
      expect.objectContaining({ name: 'createEvlogError', typeFrom: 'evlog' }),
    ]))

    for (const entry of [...clientImports, ...serverImports]) {
      expect(entry.typeFrom, `${entry.name} missing typeFrom`).toBeTruthy()
      expect(entry.from).toMatch(/^\/resolved\//)
    }
  })
})
