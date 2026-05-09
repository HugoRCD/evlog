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
    // `stream` is auto-enabled in dev — boots a mini HTTP server on an
    // ephemeral port and prints the URL at startup. Override with:
    //   stream: true                          // enable in dev AND prod
    //   stream: false                         // disable everywhere
    //   stream: { port: 4317, token: '…' }    // explicit config
    redact: true,
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
        { path: '/api/test/drain' }, // Always keep drain test logs
        { path: '/api/test/better-auth/**' }, // Always keep better-auth test logs
      ],
    },
  },
})
