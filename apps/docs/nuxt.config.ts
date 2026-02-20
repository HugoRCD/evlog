export default defineNuxtConfig({
  extends: ['docus'],

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
