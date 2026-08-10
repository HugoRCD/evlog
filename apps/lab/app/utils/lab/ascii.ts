/**
 * The glyph ramp the ascii screen draws with.
 *
 * A row of characters rasterized into one texture, ordered darkest to lightest,
 * so the shader turns a cell's brightness into a glyph with a multiply and a
 * floor — no lookup table, no branch per character.
 *
 * The order is measured rather than declared. How much ink a `%` puts down
 * relative to a `#` is a fact about the font in use, and every hand-written ramp
 * on the internet is ordered for a font nobody here has: get it wrong and a
 * gradient reads as noise, because a step that should have got darker got
 * lighter instead.
 */

import type { AsciiSet } from './settings'

/**
 * The characters each ramp is allowed to use, not the order it uses them in.
 *
 * None of them starts with a space, and that is deliberate. A blank darkest step
 * means the dark half of every shot is simply absent, the grid stops existing
 * wherever the picture is black, and what should read as a lit panel reads as
 * sparse noise on a void. The faintest mark in a ramp is a mark.
 *
 * `code` is the long one — seventy glyphs is more brightness steps than an 8-bit
 * frame has any use for, but the density of the ramp is what makes fine detail
 * survive being reduced to type.
 */
const RAMPS: Record<AsciiSet, string> = {
  ascii: '.:-=+*#%@',
  blocks: '·░▒▓█',
  shades: '·∴∷▪▦▩█',
  code: '.\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
}

/**
 * Cell shape per ramp, as a ratio of height to width.
 *
 * Monospaced letters are about twice as tall as they are wide, so a square cell
 * stretches every one of them and the picture comes out squashed — a terminal
 * lays type out in tall cells for exactly this reason.
 *
 * Marks and blocks carry no such bias: they are drawn to fill their box. Giving
 * them square cells is what turns those ramps from stretched type into a dot
 * matrix, which is the thing they are actually good for.
 */
const CELL_ASPECT: Record<AsciiSet, number> = {
  ascii: 2,
  code: 2,
  blocks: 1,
  shades: 1,
}

export function asciiCellAspect(set: AsciiSet): number {
  return CELL_ASPECT[set]
}

/**
 * Narrowest cell a glyph can still be a glyph in.
 *
 * Below this the ramp stops carrying anything: a character six pixels tall has
 * a couple of strokes, and the difference between the marks in a ramp is finer
 * than that. The screen keeps working — it just draws the same smear at every
 * brightness, which is a grid with no picture in it.
 */
export const ASCII_MIN_CELL = 6

/**
 * Atlas cell size.
 *
 * Square, and the same for every ramp. The shape a glyph is *drawn* at is the
 * screen's business — the shader stretches this cell to whatever the ramp asks
 * for — and rasterizing tall cells here would have applied that stretch twice.
 */
const CELL = 48

/**
 * Loaded before anything is measured.
 *
 * Rasterizing against the fallback and caching the result would pin the ramp to
 * a font the page then replaces, and the ordering measured off it is wrong for
 * the one actually drawn.
 */
const FONT_FAMILY = '"Geist Mono", ui-monospace, monospace'

export interface GlyphAtlas {
  /** One row of cells, ordered darkest first. Coverage lives in the alpha channel. */
  canvas: HTMLCanvasElement
  count: number
  /**
   * What the brightest glyph in the ramp has to be multiplied by to emit as much
   * light as a filled cell.
   *
   * Ramps are not equally dense. A block fills its cell; an `@` covers about a
   * third of one and a `.` almost none — so the same shot drawn with letters
   * emitted a third of the light it did drawn with blocks, came out dim, and had
   * nothing left above the bloom threshold. Normalising here is what lets a ramp
   * be a choice of texture rather than a choice of exposure.
   */
  gain: number
}

function context(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Failed to allocate a 2D context for the glyph atlas.')

  ctx.font = `${Math.round(CELL * 0.92)}px ${FONT_FAMILY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  return ctx
}

/** Total coverage a glyph puts down, as a fraction of its cell. */
function inkOf(ctx: CanvasRenderingContext2D, glyph: string): number {
  ctx.clearRect(0, 0, CELL, CELL)
  ctx.fillText(glyph, CELL / 2, CELL / 2)

  const { data } = ctx.getImageData(0, 0, CELL, CELL)
  let sum = 0
  for (let i = 3; i < data.length; i += 4) sum += data[i] ?? 0
  return sum / (255 * CELL * CELL)
}

const cache = new Map<AsciiSet, Promise<GlyphAtlas>>()

/**
 * Build — or return — the atlas for a ramp.
 *
 * Cached by name and never invalidated: the fonts are loaded before the first
 * one is measured, and nothing after that changes what a glyph looks like.
 */
export function glyphAtlas(set: AsciiSet): Promise<GlyphAtlas> {
  let pending = cache.get(set)
  if (!pending) {
    pending = build(set)
    cache.set(set, pending)
  }
  return pending
}

async function build(set: AsciiSet): Promise<GlyphAtlas> {
  await document.fonts.ready

  const glyphs = Array.from(RAMPS[set])
  const scratch = context(CELL, CELL)
  const measured = glyphs
    .map(glyph => ({ glyph, ink: inkOf(scratch, glyph) }))
    .sort((a, b) => a.ink - b.ink)

  const ctx = context(CELL * measured.length, CELL)
  measured.forEach(({ glyph }, index) => {
    ctx.fillText(glyph, index * CELL + CELL / 2, CELL / 2)
  })

  // Measured off the densest glyph rather than the mean: it is the one that has
  // to reach full white, and scaling by an average would blow it past that.
  const densest = measured[measured.length - 1]?.ink ?? 1
  return { canvas: ctx.canvas, count: measured.length, gain: 1 / Math.max(densest, 0.05) }
}
