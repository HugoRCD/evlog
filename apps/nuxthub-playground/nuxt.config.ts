export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@evlog/nuxthub'],

  compatibilityDate: 'latest',

  build: {
    transpile: ['mdc-syntax'],
  },

  hub: {
    db: 'sqlite',
  },

  evlog: {
    env: {
      service: 'nuxthub-playground',
    },
    exclude: ['/api/logs'],
    retention: '1m',
  },
})
