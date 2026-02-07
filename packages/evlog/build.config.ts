import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    { input: 'src/index', name: 'index' },
    { input: 'src/nuxt/module', name: 'nuxt/module' },
    { input: 'src/nitro/plugin', name: 'nitro/plugin' },
    { input: 'src/nitro/errorHandler', name: 'nitro/errorHandler' },
    { input: 'src/runtime/client/log', name: 'runtime/client/log' },
    { input: 'src/runtime/client/plugin', name: 'runtime/client/plugin' },
    { input: 'src/runtime/server/useLogger', name: 'runtime/server/useLogger' },
    { input: 'src/runtime/server/routes/_evlog/ingest.post', name: 'runtime/server/routes/_evlog/ingest.post' },
    { input: 'src/runtime/utils/parseError', name: 'runtime/utils/parseError' },
    { input: 'src/error', name: 'error' },
    { input: 'src/logger', name: 'logger' },
    { input: 'src/utils', name: 'utils' },
    { input: 'src/types', name: 'types' },
    { input: 'src/workers/index', name: 'workers' },
    { input: 'src/adapters/axiom', name: 'adapters/axiom' },
    { input: 'src/adapters/otlp', name: 'adapters/otlp' },
    { input: 'src/adapters/posthog', name: 'adapters/posthog' },
  ],
  declaration: true,
  clean: true,
  rollup: {
    emitCJS: false,
    esbuild: {
      target: 'esnext',
    },
  },
  externals: [
    '#app',
    '#imports',
    'vue',
    'nuxt',
    '@nuxt/kit',
    '@nuxt/schema',
    'nitropack',
    'nitropack/runtime',
    'ofetch',
    'h3',
  ],
})
