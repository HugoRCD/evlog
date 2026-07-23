import { rawRedirects, redirects } from './config/redirects'

export default defineNuxtConfig({
  extends: ['docus'],

  experimental: {
    appManifest: true,
    emitRouteChunkError: 'automatic-immediate',
    checkOutdatedBuildInterval: 60_000,
  },

  routeRules: {
    '/': { prerender: true, headers: { 'cache-control': 'public, max-age=0, must-revalidate' } },
    '/_nuxt/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    '/**': { headers: { 'cache-control': 'public, max-age=0, must-revalidate' } },
    ...redirects,
    ...rawRedirects,
  },

  // Docus defaults to allowing everything. Keep non-content routes (the MCP
  // JSON-RPC endpoint, the Studio CMS editor) out of the crawl — they 405/302
  // on a GET and only add noise to Search Console Coverage.
  robots: {
    groups: [{ userAgent: '*', allow: '/', disallow: ['/mcp', '/_studio'] }],
    sitemap: '/sitemap.xml',
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
        weights: [400, 500],
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
    // Cache prerendered OG image output between CI builds. Cache misses spend most of
    // the Vercel build rendering /_og/s/* routes, so keeping generated images avoids
    // rerendering unchanged docs pages on every deployment.
    buildCache: true,
    // Simplified OgImageDocs.satori.vue (text-shadow only) keeps prerender under timeout.
    // Missing prerendered assets fall back to /og.png via server/middleware/01-og-fallback.ts.
    defaults: {
      // Satori cannot parse woff2 — keep woff2 in @nuxt/fonts for the browser, TTF here for OG images.
      fonts: [
        { name: 'Geist Pixel Line', weight: 400, path: '/fonts/GeistPixel-Line.ttf' },
        { name: 'Geist Pixel Line', weight: 500, path: '/fonts/GeistPixel-Line.ttf' },
      ],
    },
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
        'jsonc',
        'jsonl',
        'kusto',
        'md',
        'mdc',
        'shell',
        'sql',
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
