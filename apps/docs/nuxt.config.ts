import { redirects } from './config/redirects'

export default defineNuxtConfig({
  extends: ['docus'],

  routeRules: {
    '/': { prerender: true },
    ...redirects,
  },

  modules: [
    '@nuxt/fonts',
    'motion-v/nuxt',
    'nuxt-studio',
    '@vercel/analytics',
    '@vercel/speed-insights',
    '@databuddy/nuxt',
  ],

  databuddy: {
    clientId: '389b5a41-31cb-4ea4-a5e8-8ec3ac4ffccc',
    trackWebVitals: true,
    trackErrors: true,
    trackHashChanges: true,
    trackOutgoingLinks: true,
    trackInteractions: true,
    trackAttributes: true,
  },

  colorMode: {
    preference: 'dark',
  },

  fonts: {
    defaults: {
      // Full variable axis — discrete weights from @nuxt/ui defaults render too thin on Chromium.
      weights: ['100 900'],
    },
    families: [
      { name: 'Geist', weights: ['100 900'], global: true },
      { name: 'Geist Mono', weights: ['100 900'], global: true },
      {
        name: 'Geist Pixel Line',
        src: '/fonts/GeistPixel-Line.woff2',
        weights: [400],
        global: true,
      },
    ],
  },

  css: ['~/assets/css/main.css'],

  site: {
    name: 'evlog',
    url: 'https://www.evlog.dev',
  },

  ogImage: {
    // Custom OgImageDocs.satori.vue has complex shadow/blur effects that slow Satori down.
    // 15s default makes some pages timeout during prerender, which means Vercel hits the
    // zero-runtime route at runtime and returns 500 ("Not supported in zeroRuntime mode").
    security: {
      renderTimeout: 60_000,
    },
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
