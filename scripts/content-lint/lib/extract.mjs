/**
 * HTML to markdown, for scanning a page that is not in the repository.
 *
 * The output is markdown rather than plain text on purpose: `parseMarkdown`
 * already knows how to keep code fences, links, and headings out of the prose
 * metrics, so extraction is the only new step and every check downstream is
 * the one that runs on a docs page.
 *
 * This is a heuristic, and it is allowed to be. It drops nav, header, footer,
 * and aside, prefers `<main>` then `<article>`, and falls back to the body. A
 * page that hides its content behind script is out of reach, and the scan of
 * one will read as a thin page rather than a clean one.
 */

const VOID_OF_CONTENT = /<(script|style|noscript|svg|template|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi
const CHROME = /<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi
const COMMENT = /<!--[\s\S]*?-->/g

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
}

/**
 * @param {string} html
 * @returns {{ title: string | null, markdown: string }}
 */
export function extract(html) {
  const title = decode(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? '') || null

  let body = html.replace(COMMENT, '').replace(VOID_OF_CONTENT, '')
  body = region(body, 'main') ?? region(body, 'article') ?? region(body, 'body') ?? body
  body = body.replace(CHROME, '')

  return { title, markdown: toMarkdown(body) }
}

/**
 * The inner HTML of the first element with this tag, up to its first closing
 * tag. Lazy on purpose: a greedy capture on a page with several `<article>`
 * elements runs from the first to the last and keeps the markup between them.
 *
 * @param {string} html
 * @param {string} tag
 * @returns {string | null}
 */
function region(html, tag) {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(html)
  return match ? match[1] : null
}

/**
 * @param {string} html
 * @returns {string}
 */
function toMarkdown(html) {
  let out = html

  out = out.replace(/<pre\b[^>]*>\s*(?:<code\b[^>]*>)?([\s\S]*?)(?:<\/code>)?\s*<\/pre>/gi,
    (_match, code) => `\n\n\`\`\`\n${decode(strip(code))}\n\`\`\`\n\n`)
  out = out.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_match, code) => `\`${decode(strip(code))}\``)

  // Anchors first: the heading and list callbacks below both strip tags, so an
  // anchor converted after them is an anchor already deleted, and every link in
  // a bullet or a heading would vanish from `doc.links`.
  out = out.replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, href, text) => {
    const label = collapse(decode(strip(text)))
    return label ? `[${label}](${href})` : ''
  })

  out = out.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_match, depth, text) => `\n\n${'#'.repeat(Number(depth))} ${collapse(decode(strip(text)))}\n\n`)

  out = out.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi,
    (_match, text) => `\n- ${collapse(decode(strip(text)))}`)

  out = out.replace(/<br\s*\/?>/gi, '\n')
  out = out.replace(/<\/(p|div|section|tr|blockquote|ul|ol)>/gi, '\n\n')
  out = strip(out)

  return decode(out)
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * @param {string} text
 * @returns {string}
 */
function strip(text) {
  return text.replace(/<[^>]+>/g, '')
}

/**
 * @param {string} text
 * @returns {string}
 */
function collapse(text) {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * @param {string} text
 * @returns {string}
 */
function decode(text) {
  return text
    .replace(/&#(\d+);/g, (match, code) => codePoint(Number(code), match))
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => codePoint(Number.parseInt(code, 16), match))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
}

/**
 * A numeric entity outside the Unicode range is a typo or an attack, and
 * `fromCodePoint` throws on both. Leave it as written.
 *
 * @param {number} code
 * @param {string} original
 * @returns {string}
 */
function codePoint(code, original) {
  return Number.isInteger(code) && code >= 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : original
}
