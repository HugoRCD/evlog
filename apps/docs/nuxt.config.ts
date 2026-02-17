export default defineNuxtConfig({
  extends: ['docus'],

  modules: ['motion-v/nuxt', 'nuxt-studio'],

  css: ['~/assets/css/main.css'],

  site: {
    name: 'evlog',
    url: 'https://evlog.dev',
  },

  studio: {
    route: '/_studio',
    repository: {
      provider: 'github',
      owner: 'hugorcd',
      repo: 'evlog',
      branch: 'main',
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
