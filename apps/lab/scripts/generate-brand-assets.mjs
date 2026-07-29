/**
 * Re-derives everything in `public/` that carries the brand.
 *
 *   pnpm --filter render-labs brand:assets
 *
 * Render labs is branded evlog, so the icons are evlog's own — copied from the
 * docs app rather than redrawn, which is what stops the two from drifting when
 * the mark changes. They are copied instead of mounted: `nitro.publicAssets`
 * can only mount a whole directory, and doing that also served evlog's
 * `og.png` and `site.webmanifest` from this origin, overriding the ones here.
 *
 * `og.png` is the only asset that genuinely has to be rasterized — no unfurler
 * renders SVG, so pointing `og:image` at one ships a blank card everywhere.
 */

import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const branding = fileURLToPath(new URL('../branding/', import.meta.url))
const brand = fileURLToPath(new URL('../../docs/public/', import.meta.url))
const out = fileURLToPath(new URL('../public/', import.meta.url))

/** evlog's icon set, used as-is. */
const icons = [
  ['favicon.ico', 'favicon.ico'],
  ['favicon-16x16.png', 'favicon-16x16.png'],
  ['favicon-32x32.png', 'favicon-32x32.png'],
  ['apple-touch-icon.png', 'apple-touch-icon.png'],
  ['android-chrome-192x192.png', 'android-chrome-192x192.png'],
  ['android-chrome-512x512.png', 'android-chrome-512x512.png'],
]

for (const [from, to] of icons) {
  await copyFile(brand + from, out + to)
  console.log(`${to.padEnd(28)} copied from evlog`)
}

/**
 * A maskable variant, which evlog does not ship.
 *
 * Android may crop an icon to a circle inscribed in the middle 80%, and the
 * wordmark runs nearly edge to edge — so it is inset onto black rather than
 * declared maskable as it stands and clipped mid-letter.
 */
const maskable = await sharp(brand + 'android-chrome-512x512.png')
  .resize(410, 410)
  .extend({ top: 51, bottom: 51, left: 51, right: 51, background: '#000000' })
  .png({ compressionLevel: 9 })
  .toBuffer()
await writeFile(out + 'icon-maskable-512.png', maskable)
console.log(`${'icon-maskable-512.png'.padEnd(28)} 512x512  ${(maskable.length / 1024).toFixed(1)} kB`)

/**
 * The social card, with evlog's mark composited into the slot the SVG leaves
 * open for it — librsvg will not resolve a file reference from inside an SVG,
 * and inlining the mark would be a second copy to keep in sync.
 */
const card = await sharp(await readFile(branding + 'og.svg'), { density: 300 })
  .resize(1200, 630)
  .composite([{
    input: await sharp(brand + 'android-chrome-512x512.png').resize(40, 40).toBuffer(),
    top: 462,
    left: 64,
  }])
  .png({ compressionLevel: 9 })
  .toBuffer()
await writeFile(out + 'og.png', card)
console.log(`${'og.png'.padEnd(28)} 1200x630  ${(card.length / 1024).toFixed(1)} kB`)
