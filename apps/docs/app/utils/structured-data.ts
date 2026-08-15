/**
 * JSON-LD derived from the content itself.
 *
 * The questions and answers live in `0.landing.md` and the breadcrumb lives in
 * the route. Both are read back here rather than restated, so a schema that
 * disagrees with the page is not a thing that can happen.
 *
 * Written by hand instead of through `nuxt-schema-org`: the site needs four
 * shapes, and none of them is worth a dependency.
 */

/** A minimark node: `[tag, props, ...children]`, or a bare string for text. */
type MinimarkNode = string | [string, Record<string, unknown>, ...MinimarkNode[]]

const SITE = 'https://www.evlog.dev'

/** Section directories, in navigation order, mapped to what a reader calls them. */
const SECTIONS: Record<string, string> = {
  start: 'Get started',
  learn: 'Learn',
  cli: 'CLI',
  integrate: 'Integrate',
  'use-cases': 'Use cases',
  extend: 'Extend',
  reference: 'Reference',
}

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

/**
 * A docs page as a `TechArticle`, plus the trail that reached it.
 *
 * @param page Route path, title and description of the page being rendered.
 * @returns One graph carrying both shapes.
 */
export function articleSchema(page: { path: string, title?: string, description?: string }): object {
  const segments = page.path.split('/').filter(Boolean)
  const trail: { name: string, item: string }[] = [{ name: 'evlog', item: `${SITE}/` }]

  let href = ''
  for (const [index, segment] of segments.entries()) {
    href += `/${segment}`
    const last = index === segments.length - 1
    const name = last ? (page.title ?? segment) : (SECTIONS[segment] ?? segment)
    trail.push({ name, item: `${SITE}${href}` })
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        headline: page.title,
        description: page.description,
        url: `${SITE}${page.path}`,
        isPartOf: { '@type': 'WebSite', name: 'evlog', url: `${SITE}/` },
        about: { '@type': 'SoftwareApplication', name: 'evlog', applicationCategory: 'DeveloperApplication' },
        author: { '@type': 'Person', name: 'HugoRCD', url: 'https://hugorcd.com/' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: trail.map((entry, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: entry.name,
          item: entry.item,
        })),
      },
    ],
  }
}
