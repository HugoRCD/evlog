/**
 * MDC-aware markdown segmentation.
 *
 * Docus pages are not plain markdown: prose lives inside `::component` blocks,
 * `---` prop blocks carry configuration that must never be measured as text,
 * and `:br` is layout. Everything downstream measures prose, so the split
 * happens once, here.
 */

const FENCE = /^\s*(`{3,}|~{3,})/
const MDC_OPEN = /^\s*(:{2,})([a-z][\w-]*)/i
const MDC_CLOSE = /^\s*(:{2,})\s*$/
const MDC_INLINE = /^\s*:([a-z][\w-]*)(\{.*\})?\s*$/i
const SLOT = /^\s*#[\w-]+\s*$/
const HEADING = /^(#{1,6})\s+(.*)$/
const BULLET = /^\s*[-*+]\s+(.*)$/
const ORDERED = /^\s*\d+[.)]\s+(.*)$/
const TABLE_ROW = /^\s*\|.*\|\s*$/

/**
 * @typedef {object} ParsedDoc
 * @property {Record<string, string>} frontmatter Raw scalar frontmatter values.
 * @property {{ depth: number, text: string, line: number }[]} headings
 * @property {{ text: string, line: number, component: string | null }[]} paragraphs
 * @property {{ line: number, component: string | null, items: { text: string, line: number }[] }[]} lists
 * @property {{ lang: string, file: string | null, text: string, line: number }[]} code
 * @property {{ name: string, line: number }[]} components
 * @property {{ text: string, href: string, line: number }[]} links
 * @property {{ token: string, line: number }[]} inlineCode
 * @property {{ text: string, line: number }[]} tableRows Row text, for context only.
 * @property {number} tables Table rows, header separators included.
 */

/**
 * Split a markdown source into the segments the metrics operate on.
 *
 * @param {string} source Raw file contents.
 * @returns {ParsedDoc}
 */
export function parseMarkdown(source) {
  const lines = source.split(/\r?\n/)
  const doc = {
    frontmatter: {},
    headings: [],
    paragraphs: [],
    lists: [],
    code: [],
    components: [],
    links: [],
    inlineCode: [],
    tableRows: [],
    tables: 0,
  }

  /** @type {string[]} */
  const componentStack = []
  let buffer = []
  let bufferLine = 0
  let listItems = []
  let listLine = 0

  const flushParagraph = () => {
    if (buffer.length === 0) return
    const raw = buffer.join(' ')
    const text = cleanInline(raw, bufferLine, doc)
    if (text.trim()) {
      doc.paragraphs.push({ text, line: bufferLine, component: componentStack.at(-1) ?? null })
    }
    buffer = []
  }

  const flushList = () => {
    if (listItems.length === 0) return
    doc.lists.push({ line: listLine, component: componentStack.at(-1) ?? null, items: listItems })
    listItems = []
  }

  let index = 0

  if (lines[0]?.trim() === '---') {
    index = 1
    while (index < lines.length && lines[index].trim() !== '---') {
      const match = /^([\w-]+):\s*(.*)$/.exec(lines[index])
      if (match && match[2].trim()) doc.frontmatter[match[1]] = match[2].trim()
      index += 1
    }
    index += 1
  }

  for (; index < lines.length; index += 1) {
    const line = lines[index]
    const lineNumber = index + 1

    const fence = FENCE.exec(line)
    if (fence) {
      flushParagraph()
      flushList()
      const marker = fence[1]
      const meta = line.slice(line.indexOf(marker) + marker.length).trim()
      const body = []
      index += 1
      while (index < lines.length && !lines[index].trimStart().startsWith(marker)) {
        body.push(lines[index])
        index += 1
      }
      const file = /\[([^\]]+)\]/.exec(meta)
      doc.code.push({
        lang: meta.split(/[\s[]/)[0] ?? '',
        file: file ? file[1] : null,
        text: body.join('\n'),
        line: lineNumber,
      })
      continue
    }

    if (MDC_CLOSE.test(line) && componentStack.length > 0) {
      flushParagraph()
      flushList()
      componentStack.pop()
      continue
    }

    const open = MDC_OPEN.exec(line)
    if (open) {
      flushParagraph()
      flushList()
      doc.components.push({ name: open[2], line: lineNumber })
      componentStack.push(open[2])
      // A prop block opens on the line right after the component. Its values
      // are configuration and never prose, but `to:` and `href:` are the links
      // a card group uses to reach every page in a section.
      if (lines[index + 1]?.trim() === '---') {
        index += 2
        while (index < lines.length && lines[index].trim() !== '---') {
          const route = /^\s*(?:to|href|link):\s*['"]?([^'"\s]+)['"]?\s*$/.exec(lines[index])
          if (route) doc.links.push({ text: '', href: route[1], line: index + 1 })
          index += 1
        }
      }
      continue
    }

    if (MDC_INLINE.test(line) && componentStack.length > 0) continue
    if (SLOT.test(line)) {
      flushParagraph()
      flushList()
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      flushParagraph()
      flushList()
      doc.headings.push({
        depth: heading[1].length,
        text: cleanInline(heading[2], lineNumber, doc),
        line: lineNumber,
      })
      continue
    }

    if (TABLE_ROW.test(line)) {
      flushParagraph()
      flushList()
      doc.tables += 1
      // A table cell is not prose, but a link inside one is still a link: the
      // framework and adapter indexes point at every page from a table. The
      // row text is kept so a symbol found here still has a sentence around it.
      doc.tableRows.push({ text: cleanInline(line, lineNumber, doc), line: lineNumber })
      continue
    }

    const bullet = BULLET.exec(line) ?? ORDERED.exec(line)
    if (bullet) {
      flushParagraph()
      if (listItems.length === 0) listLine = lineNumber
      listItems.push({ text: cleanInline(bullet[1], lineNumber, doc), line: lineNumber })
      continue
    }

    if (!line.trim()) {
      flushParagraph()
      flushList()
      continue
    }

    if (listItems.length > 0) {
      // A continuation line inside the current bullet.
      const last = listItems.at(-1)
      last.text = `${last.text} ${cleanInline(line.trim(), lineNumber, doc)}`
      continue
    }

    if (buffer.length === 0) bufferLine = lineNumber
    buffer.push(line.trim())
  }

  flushParagraph()
  flushList()
  return doc
}

/**
 * Strip markdown decoration from a prose span, recording the links and inline
 * code it carried. Inline code becomes a single placeholder word so sentence
 * length stays honest without a symbol inflating the count.
 *
 * @param {string} text
 * @param {number} line
 * @param {ParsedDoc} doc Collector for links and inline code.
 * @returns {string}
 */
function cleanInline(text, line, doc) {
  let out = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '')

  out = out.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_match, label, href) => {
    doc.links.push({ text: label, href, line })
    return label
  })

  out = out.replace(/`([^`]+)`/g, (_match, token) => {
    doc.inlineCode.push({ token, line })
    return 'code'
  })

  return out
    .replace(/:br\b/g, ' ')
    .replace(/\{[^{}]*\}/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const ABBREVIATIONS = ['e.g.', 'i.e.', 'etc.', 'vs.', 'Dr.', 'Mr.', 'Ms.', 'approx.']

/**
 * Split prose into sentences, keeping common abbreviations intact.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function sentences(text) {
  let guarded = text
  ABBREVIATIONS.forEach((abbreviation, position) => {
    guarded = guarded.split(abbreviation).join(`\u0000${position}\u0000`)
  })

  return guarded
    // A lowercase start is a real sentence here: this corpus opens them with
    // tool names and package paths (`pino writes through a transport`). The
    // lookbehind still requires terminal punctuation, and abbreviations are
    // masked above.
    .split(/(?<=[.!?])\s+(?=[A-Za-z`"'(\d])/)
    .map(part => part.replace(/\u0000(\d+)\u0000/g, (_match, position) => ABBREVIATIONS[Number(position)]))
    .map(part => part.trim())
    .filter(Boolean)
}

/**
 * @param {string} text
 * @returns {number}
 */
export function wordCount(text) {
  const matches = text.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g)
  return matches ? matches.length : 0
}
