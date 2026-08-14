type MinimarkNode = string | [string, Record<string, string>, ...MinimarkNode[]]

export type FaqEntry = {
  question: string
  answer: string
}

function textOf(nodes: MinimarkNode[]): string {
  return nodes
    .map(node => typeof node === 'string' ? node : textOf(node.slice(2) as MinimarkNode[]))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Collect every `::accordion-item` label and body from a Nuxt Content minimark
 * tree, so `FAQPage` structured data is generated from the questions the page
 * actually renders instead of a second copy that drifts from them.
 *
 * @param nodes - The `body.value` of a content document
 * @returns One entry per accordion item, in document order
 */
export function collectFaqEntries(nodes: MinimarkNode[]): FaqEntry[] {
  return nodes.flatMap((node) => {
    if (typeof node === 'string') return []
    const [tag, props, ...children] = node
    if (tag === 'accordion-item' && props.label) {
      return [{ question: props.label, answer: textOf(children) }]
    }
    return collectFaqEntries(children)
  })
}
