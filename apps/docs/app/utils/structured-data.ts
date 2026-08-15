/**
 * The landing's FAQ as JSON-LD, derived from the content itself.
 *
 * The questions and answers live in `0.landing.md` and are read back here
 * rather than restated, so a schema that disagrees with the page is not a thing
 * that can happen.
 *
 * This is the only shape the site adds. Docus already emits `Article` and
 * `BreadcrumbList` on every docs page from its own `useSeo`, and the landing
 * carries `SoftwareApplication` inline.
 */

/** A minimark node: `[tag, props, ...children]`, or a bare string for text. */
type MinimarkNode = string | [string, Record<string, unknown>, ...MinimarkNode[]]

function isElement(node: MinimarkNode): node is [string, Record<string, unknown>, ...MinimarkNode[]] {
  return Array.isArray(node) && typeof node[0] === 'string'
}

/**
 * Every text node under `node`, joined and collapsed.
 *
 * @param node A minimark subtree.
 * @returns The prose a reader sees, with the markup removed.
 */
function textOf(node: MinimarkNode): string {
  if (typeof node === 'string') return node
  if (!isElement(node)) return ''
  return node.slice(2).map(child => textOf(child as MinimarkNode)).join('')
}

/**
 * Depth-first walk yielding every element with the given tag.
 *
 * @param node A minimark subtree or a list of them.
 * @param tag The tag to collect.
 */
function* elements(node: unknown, tag: string): Generator<[string, Record<string, unknown>, ...MinimarkNode[]]> {
  if (Array.isArray(node) && isElement(node as MinimarkNode)) {
    const element = node as [string, Record<string, unknown>, ...MinimarkNode[]]
    if (element[0] === tag) yield element
    for (const child of element.slice(2)) yield* elements(child, tag)
    return
  }
  if (Array.isArray(node)) {
    for (const child of node) yield* elements(child, tag)
  }
}

/**
 * The landing's FAQ as a `FAQPage`, read from the accordion it renders.
 *
 * @param body The parsed body of `/landing`.
 * @returns The JSON-LD object, or null when the page carries no accordion.
 */
export function faqSchema(body: unknown): object | null {
  const questions = [...elements((body as { value?: unknown })?.value, 'accordion-item')]
    .map(item => ({ label: String(item[1].label ?? ''), answer: item.slice(2).map(child => textOf(child as MinimarkNode)).join(' ').replace(/\s+/g, ' ').trim() }))
    .filter(entry => entry.label && entry.answer)

  if (questions.length === 0) return null

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map(entry => ({
      '@type': 'Question',
      name: entry.label,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  }
}
