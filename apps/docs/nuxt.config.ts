export default defineNuxtConfig({
  extends: ['docus'],

  modules: ['motion-v/nuxt'],

  css: ['~/assets/css/main.css'],

  site: {
    name: 'evlog',
    url: 'https://evlog.dev',
  },

  mcp: {
    name: 'evlog MCP',
  },

  vite: {
    server: {
      allowedHosts: ["sb-6uos9skfpabx.vercel.run"]
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
