export default defineNuxtConfig({
  extends: ['docus'],

  routeRules: {
    '/getting-started': { redirect: { to: '/getting-started/introduction', statusCode: 301 } },
    '/frameworks': { redirect: { to: '/frameworks/overview', statusCode: 301 } },
    '/adapters': { redirect: { to: '/adapters/overview', statusCode: 301 } },
    '/core-concepts': { redirect: { to: '/core-concepts/lifecycle', statusCode: 301 } },
    '/enrichers': { redirect: { to: '/enrichers/overview', statusCode: 301 } },
    '/use-cases': { redirect: { to: '/use-cases/cli-and-scripts', statusCode: 301 } },
    '/nuxthub': { redirect: { to: '/adapters/self-hosted/nuxthub', statusCode: 301 } },
    '/nuxthub/overview': { redirect: { to: '/adapters/self-hosted/nuxthub', statusCode: 301 } },
    '/nuxthub/retention': { redirect: { to: '/adapters/self-hosted/nuxthub#retention', statusCode: 301 } },
    '/adapters/nuxthub': { redirect: { to: '/adapters/self-hosted/nuxthub', statusCode: 301 } },
    '/adapters/nuxthub/overview': { redirect: { to: '/adapters/self-hosted/nuxthub', statusCode: 301 } },
    '/adapters/nuxthub/retention': { redirect: { to: '/adapters/self-hosted/nuxthub#retention', statusCode: 301 } },
    '/adapters/self-hosted/nuxthub/overview': { redirect: { to: '/adapters/self-hosted/nuxthub', statusCode: 301 } },
    '/adapters/self-hosted/nuxthub/retention': { redirect: { to: '/adapters/self-hosted/nuxthub#retention', statusCode: 301 } },
    '/adapters/axiom': { redirect: { to: '/adapters/cloud/axiom', statusCode: 301 } },
    '/adapters/otlp': { redirect: { to: '/adapters/cloud/otlp', statusCode: 301 } },
    '/adapters/posthog': { redirect: { to: '/adapters/cloud/posthog', statusCode: 301 } },
    '/adapters/sentry': { redirect: { to: '/adapters/cloud/sentry', statusCode: 301 } },
    '/adapters/better-stack': { redirect: { to: '/adapters/cloud/better-stack', statusCode: 301 } },
    '/adapters/datadog': { redirect: { to: '/adapters/cloud/datadog', statusCode: 301 } },
    '/adapters/hyperdx': { redirect: { to: '/adapters/cloud/hyperdx', statusCode: 301 } },
    '/adapters/fs': { redirect: { to: '/adapters/self-hosted/fs', statusCode: 301 } },
    '/adapters/pipeline': { redirect: { to: '/adapters/building-blocks/pipeline', statusCode: 301 } },
    '/adapters/custom': { redirect: { to: '/adapters/building-blocks/custom', statusCode: 301 } },
    '/adapters/http': { redirect: { to: '/adapters/building-blocks/http', statusCode: 301 } },
    '/adapters/browser': { redirect: { to: '/adapters/building-blocks/http', statusCode: 301 } },
    '/examples/nextjs': { redirect: { to: '/frameworks/nextjs', statusCode: 301 } },
    '/examples/sveltekit': { redirect: { to: '/frameworks/sveltekit', statusCode: 301 } },
    '/examples/tanstack-start': { redirect: { to: '/frameworks/tanstack-start', statusCode: 301 } },
    '/examples/nestjs': { redirect: { to: '/frameworks/nestjs', statusCode: 301 } },
    '/examples/express': { redirect: { to: '/frameworks/express', statusCode: 301 } },
    '/examples/hono': { redirect: { to: '/frameworks/hono', statusCode: 301 } },
    '/examples/fastify': { redirect: { to: '/frameworks/fastify', statusCode: 301 } },
    '/examples/elysia': { redirect: { to: '/frameworks/elysia', statusCode: 301 } },
    '/examples/react-router': { redirect: { to: '/frameworks/react-router', statusCode: 301 } },
    '/logging': { redirect: { to: '/logging/overview', statusCode: 301 } },
    '/core-concepts/wide-events': { redirect: { to: '/logging/wide-events', statusCode: 301 } },
    '/core-concepts/structured-errors': { redirect: { to: '/logging/structured-errors', statusCode: 301 } },
    '/core-concepts/client-logging': { redirect: { to: '/logging/client-logging', statusCode: 301 } },
    '/core-concepts/ai-sdk': { redirect: { to: '/logging/ai-sdk', statusCode: 301 } },
  },

  modules: [
    '@nuxt/fonts',
    'motion-v/nuxt',
    'nuxt-studio',
    '@vercel/analytics',
    '@vercel/speed-insights',
  ],

  colorMode: {
    preference: 'dark',
  },

  fonts: {
    families: [
      { name: 'Geist', weights: [400, 500, 600, 700], global: true },
      { name: 'Geist Mono', weights: [400, 500, 600, 700], global: true },
      {
        name: 'Geist Pixel Line',
        src: '/fonts/GeistPixel-Line.ttf',
        weights: [400, 500, 600],
        global: true,
      },
    ],
  },

  css: ['~/assets/css/main.css'],

  site: {
    name: 'evlog',
    url: 'https://www.evlog.dev',
  },

  studio: {
    development: {
      sync: false,
    },
    repository: {
      owner: 'HugoRCD',
      repo: 'evlog',
      rootDir: 'apps/docs',
    },
  },

  mcp: {
    name: 'evlog MCP',
  },

  content: {
    experimental: {
      sqliteConnector: 'native',
    },
  },

  mdc: {
    highlight: {
      noApiRoute: false,
      // Include every language used in `content/` — a narrow list (e.g. only `tsx`) breaks SSR
      // on refresh when Shiki/MDC cannot load grammars for `bash`, `vue`, etc.
      langs: [
        'apl',
        'bash',
        'css',
        'diff',
        'html',
        'js',
        'json',
        'md',
        'mdc',
        'shell',
        'toml',
        'ts',
        'tsx',
        'typescript',
        'vue',
        'yaml',
      ],
    },
  },

  runtimeConfig: {
    public: {
      justUseEvlogUrl: process.env.NUXT_PUBLIC_JUST_USE_EVLOG_URL || '',
    },
  },

  icon: {
    customCollections: [
      {
        prefix: 'custom',
        dir: './app/assets/icons',
      },
    ],
    clientBundle: {
      scan: true,
      includeCustomCollections: true,
    },
    provider: 'iconify',
  },

  vite: {
    optimizeDeps: {
      include: ['shaders/vue'],
    },
  },
})
