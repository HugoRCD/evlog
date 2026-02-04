export default defineNuxtConfig({
  modules: ['evlog/nuxt', '@nuxt/ui'],

  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  compatibilityDate: 'latest',

  evlog: {
    env: {
      service: 'playground',
    },
    transport: {
      enabled: true,
    },
    routes: {
      '/api/auth/**': { service: 'auth-service' },
      '/api/payment/**': { service: 'payment-service' },
      '/api/booking/**': { service: 'booking-service' },
    },
    sampling: {
      rates: {
        info: 10,
      },
      // Tail sampling: always keep these
      keep: [
        { status: 400 }, // Keep errors
        { duration: 500 }, // Keep slow requests (>500ms)
        { path: '/api/test/critical/**' }, // Keep critical paths
      ],
    },
  },
})
