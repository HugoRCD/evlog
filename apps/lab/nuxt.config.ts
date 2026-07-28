import { fileURLToPath } from 'node:url'

const docs = fileURLToPath(new URL('../docs', import.meta.url))

/**
 * The render lab: an internal capture rig for release videos.
 *
 * It films the docs site's own animated components, so those stay where they
 * are and this app reaches across to read them. That keeps a single source of
 * truth — a component tweaked for the docs is the one that gets filmed, with no
 * copy to drift — at the price of a few paths pointing into a sibling app.
 *
 * Never deployed: no analytics, no SEO, no content pipeline. Just the design
 * system the animations need to render correctly.
 */
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/fonts', 'motion-v/nuxt'],

  // Client only. Every part of this touches the DOM, a canvas or a GPU, and
  // there is no reader to serve markup to.
  ssr: false,

  css: ['~/assets/css/main.css'],

  // Dark only. The whole point is filming against black.
  colorMode: {
    preference: 'dark',
  },

  // Away from 3000, which the docs site (and anything else) tends to hold.
  devServer: {
    port: 4000,
  },

  fonts: {
    defaults: {
      // Full variable axis — discrete weights render too thin on Chromium, and
      // the plate is rasterized from this exact text.
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

  nitro: {
    // The pixel font is a public asset of the docs app, and the capture inlines
    // whatever `@font-face` resolves to — so it has to be served from here too.
    publicAssets: [{ dir: `${docs}/public`, maxAge: 0 }],
  },

  icon: {
    customCollections: [{ prefix: 'custom', dir: `${docs}/app/assets/icons` }],
    clientBundle: { scan: true, includeCustomCollections: true },
    provider: 'iconify',
  },

  vite: {
    server: {
      fs: {
        // The staged components are imported from outside this app's root.
        allow: [fileURLToPath(new URL('..', import.meta.url))],
      },
    },
  },
})
