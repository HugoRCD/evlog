import { beforeEach, describe, expect, it, vi } from 'vitest'

// Regression test for https://github.com/HugoRCD/evlog/issues/435
//
// `nuxt typecheck` (vue-tsc -b) type-checks the app tsconfig project *and*
// the server one. `$fetch`'s return-type inference does
// `typeof import('../../server/api/...')`, which pulls every server route
// (and therefore the auto-imported server globals it uses) into the app
// project's typecheck too. The `types/evlog-server.d.ts` type template must
// therefore be registered on both the `nitro` context (server tsconfig)
// and the `nuxt` context (app tsconfig) — registering it on `nitro` alone
// leaves the app project unable to resolve `useLogger`/`log`/
// `createEvlogError`, causing a `TS2304: Cannot find name` failure.

const addTypeTemplate = vi.fn()
const addImports = vi.fn()
const addServerImports = vi.fn()
const addServerHandler = vi.fn()
const addServerPlugin = vi.fn()
const addPlugin = vi.fn()
const addVitePlugin = vi.fn()
const createResolver = vi.fn(() => ({ resolve: (path: string) => path }))

vi.mock('@nuxt/kit', () => ({
  addImports,
  addPlugin,
  addServerHandler,
  addServerImports,
  addServerPlugin,
  addTypeTemplate,
  addVitePlugin,
  createResolver,
  defineNuxtModule: (definition: { setup: (options: unknown, nuxt: unknown) => unknown }) => definition,
}))

function makeFakeNuxt() {
  return {
    hook: vi.fn(),
    options: {
      dev: false,
      runtimeConfig: {
        public: {},
      },
    },
  }
}

describe('nuxt module server type template', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers types/evlog-server.d.ts for both the nitro and the app (nuxt) tsconfig projects', async () => {
    const moduleDefinition = (await import('../../src/nuxt/module')).default as unknown as {
      setup: (options: Record<string, unknown>, nuxt: ReturnType<typeof makeFakeNuxt>) => void
    }

    moduleDefinition.setup({}, makeFakeNuxt())

    const serverTemplateCall = addTypeTemplate.mock.calls.find(
      ([template]) => template?.filename === 'types/evlog-server.d.ts',
    )

    expect(serverTemplateCall).toBeDefined()
    const [, context] = serverTemplateCall!
    // `nitro: true` alone only reaches `.nuxt/tsconfig.server.json` — the app
    // project (`.nuxt/tsconfig.app.json`) never sees the declaration and
    // `useLogger`/`log`/`createEvlogError` resolve to TS2304 there.
    expect(context).toEqual({ nitro: true, nuxt: true })
  })
})
