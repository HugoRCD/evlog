import { rawRedirects, redirects } from './config/redirects'

export default defineNuxtConfig({
  extends: ['docus'],

  experimental: {
    appManifest: true,
    emitRouteChunkError: 'automatic-immediate',
    checkOutdatedBuildInterval: 60_000,
  },

  routeRules: {
    // First-party path for PostHog ingestion: a docs site for developers loses
    // most of its traffic to blockers otherwise.
    '/_ph/static/**': { proxy: 'https://eu-assets.i.posthog.com/static/**' },
    '/_ph/**': { proxy: 'https://eu.i.posthog.com/**' },
    '/': { prerender: true, headers: { 'cache-control': 'public, max-age=0, must-revalidate' } },
    '/_nuxt/**': { headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
    '/**': { headers: { 'cache-control': 'public, max-age=0, must-revalidate' } },
    ...redirects,
    ...rawRedirects,
  },

  // Docus defaults to allowing everything. Keep non-content routes (the MCP
  // JSON-RPC endpoint, the Studio CMS editor) out of the crawl — they 405/302
  // on a GET and only add noise to Search Console Coverage.
  // Top-level `disallow` merges into Docus's `*` group; declaring our own group
  // would append a second `User-agent: *` block instead of extending theirs.
  robots: {
    disallow: ['/mcp', '/_studio'],
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
  // Curate /llms.txt (and /llms-full.txt) for answer engines. Docus registers
  // `nuxt-llms` but with empty defaults, so without this block the footer's
  // `/llms.txt` link is a 404 (the module skips the route when `domain` is unset).
  llms: {
    domain: 'https://www.evlog.dev',
    title: 'evlog',
    description:
      'A modern TypeScript logger for everything you ship. Simple structured logs, wide events, and structured errors in one API - for scripts, libraries, jobs, edge, and requests.',
    notes: [
      'evlog is MIT-licensed and drop-in for console.log, pino, or consola.',
      'Wide events replace log lines: log.set accumulates context, createError carries why and fix.',
      'The CLI ships `evlog map`, a deterministic observability score that gates in CI.',
    ],
    sections: [
      {
        title: 'Get started',
        contentCollection: 'docs',
        contentFilters: [{ field: 'path', operator: 'LIKE', value: '/start/%' }],
      },
      {
        title: 'Learn',
        contentCollection: 'docs',
        contentFilters: [{ field: 'path', operator: 'LIKE', value: '/learn/%' }],
      },
      {
        title: 'CLI',
        contentCollection: 'docs',
        contentFilters: [{ field: 'path', operator: 'LIKE', value: '/cli/%' }],
      },
      {
        title: 'Integrate',
        contentCollection: 'docs',
        contentFilters: [{ field: 'path', operator: 'LIKE', value: '/integrate/%' }],
      },
      {
        title: 'Use cases',
        contentCollection: 'docs',
        contentFilters: [{ field: 'path', operator: 'LIKE', value: '/use-cases/%' }],
      },
      {
        title: 'Extend',
        contentCollection: 'docs',
        contentFilters: [{ field: 'path', operator: 'LIKE', value: '/extend/%' }],
      },
      {
        title: 'Reference',
        contentCollection: 'docs',
        contentFilters: [{ field: 'path', operator: 'LIKE', value: '/reference/%' }],
      },
    ],
    full: {
      title: 'evlog - full documentation',
      description: 'Complete evlog documentation as structured markdown for deep retrieval.',
    },
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
      posthogKey: process.env.NUXT_PUBLIC_POSTHOG_KEY || '',
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
