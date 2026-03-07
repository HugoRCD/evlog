export default defineNuxtConfig({
  extends: ['docus'],

  routeRules: {
    '/examples/nextjs': { redirect: { to: '/frameworks/nextjs', statusCode: 301 } },
    '/examples/sveltekit': { redirect: { to: '/frameworks/sveltekit', statusCode: 301 } },
    '/examples/tanstack-start': { redirect: { to: '/frameworks/tanstack-start', statusCode: 301 } },
    '/examples/nestjs': { redirect: { to: '/frameworks/nestjs', statusCode: 301 } },
    '/examples/express': { redirect: { to: '/frameworks/express', statusCode: 301 } },
    '/examples/hono': { redirect: { to: '/frameworks/hono', statusCode: 301 } },
    '/examples/fastify': { redirect: { to: '/frameworks/fastify', statusCode: 301 } },
    '/examples/elysia': { redirect: { to: '/frameworks/elysia', statusCode: 301 } },
  },

  modules: ['motion-v/nuxt', 'nuxt-studio'],

  colorMode: {
    preference: 'dark',
  },

  fonts: {
    families: [
      { name: 'Geist', weights: [400, 600, 700], global: true },
      { name: 'Geist Mono', weights: [400, 600], global: true },
    ],
  },

  css: ['~/assets/css/main.css'],

  site: {
    name: 'evlog',
    url: 'https://www.evlog.dev',
  },

  studio: {
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
      sqliteConnector: 'native'
    }
  },

  mdc: {
    highlight: {
      noApiRoute: false,
      langs: ['tsx'],
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
