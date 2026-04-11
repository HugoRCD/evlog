export default defineNuxtConfig({
  extends: ['docus'],

  routeRules: {
    '/getting-started': { redirect: { to: '/getting-started/introduction', statusCode: 301 } },
    '/frameworks': { redirect: { to: '/frameworks/overview', statusCode: 301 } },
    '/adapters': { redirect: { to: '/adapters/overview', statusCode: 301 } },
    '/core-concepts': { redirect: { to: '/core-concepts/lifecycle', statusCode: 301 } },
    '/enrichers': { redirect: { to: '/enrichers/overview', statusCode: 301 } },
    '/nuxthub': { redirect: { to: '/nuxthub/overview', statusCode: 301 } },
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
    '/adapters/browser': { redirect: { to: '/adapters/http', statusCode: 301 } },
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
      langs: ['tsx'],
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
})
