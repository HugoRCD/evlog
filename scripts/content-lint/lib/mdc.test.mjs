import { describe, expect, it } from 'vitest'
import { parseMarkdown, sentences, wordCount } from './mdc.mjs'

describe('parseMarkdown', () => {
  it('reads frontmatter scalars and drops the block from the prose', () => {
    const doc = parseMarkdown('---\ntitle: Wide Events\nnavigation:\n---\n\nAccumulate context.\n')

    expect(doc.frontmatter.title).toBe('Wide Events')
    expect(doc.paragraphs).toHaveLength(1)
    expect(doc.paragraphs[0].text).toBe('Accumulate context.')
  })

  it('keeps prose inside an MDC block and drops its prop block', () => {
    const source = [
      '::card',
      '---',
      'icon: i-lucide-shield',
      'title: Auto-redaction',
      '---',
      'PII is masked before any drain.',
      '::',
    ].join('\n')

    const doc = parseMarkdown(source)

    expect(doc.components).toEqual([{ name: 'card', line: 1 }])
    expect(doc.paragraphs.map(p => p.text)).toEqual(['PII is masked before any drain.'])
    expect(doc.paragraphs[0].component).toBe('card')
  })

  it('records code blocks with their file label and never measures their body', () => {
    const source = ['Prose above.', '', '```typescript [server/api/checkout.ts]', 'const log = useLogger(event)', '```'].join('\n')

    const doc = parseMarkdown(source)

    expect(doc.code).toHaveLength(1)
    expect(doc.code[0].file).toBe('server/api/checkout.ts')
    expect(doc.code[0].text).toBe('const log = useLogger(event)')
    expect(doc.paragraphs).toHaveLength(1)
  })

  it('collects links and inline code, and replaces them in the prose', () => {
    const doc = parseMarkdown('See [Sampling](/learn/sampling) and call `log.set`.')

    expect(doc.links).toEqual([{ text: 'Sampling', href: '/learn/sampling', line: 1 }])
    expect(doc.inlineCode).toEqual([{ token: 'log.set', line: 1 }])
    expect(doc.paragraphs[0].text).toBe('See Sampling and call code.')
  })

  it('groups bullets into one list and joins continuation lines', () => {
    const doc = parseMarkdown('- head sampling drops by level\n  at emit time\n- tail sampling rescues errors\n')

    expect(doc.lists).toHaveLength(1)
    expect(doc.lists[0].items).toHaveLength(2)
    expect(doc.lists[0].items[0].text).toBe('head sampling drops by level at emit time')
  })

  it('drops :br and slot markers from landing copy', () => {
    const doc = parseMarkdown('::landing-hero\n#title\nSet context. :br Get answers\n::')

    expect(doc.paragraphs[0].text).toBe('Set context. Get answers')
  })
})

describe('sentences', () => {
  it('splits on terminal punctuation', () => {
    expect(sentences('The pipeline batches. It never blocks.')).toEqual([
      'The pipeline batches.',
      'It never blocks.',
    ])
  })

  it('keeps abbreviations intact', () => {
    expect(sentences('Drains batch, e.g. Axiom. Then they retry.')).toEqual([
      'Drains batch, e.g. Axiom.',
      'Then they retry.',
    ])
  })
})

describe('wordCount', () => {
  it('counts hyphenated and apostrophed words once', () => {
    expect(wordCount("you're running a drop-in adapter")).toBe(5)
  })
})
