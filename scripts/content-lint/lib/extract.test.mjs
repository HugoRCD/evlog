import { describe, expect, it } from 'vitest'
import { extract } from './extract.mjs'
import { parseMarkdown } from './mdc.mjs'
import { measure } from './metrics.mjs'

const page = (body, wrapper = 'main') => `
<!doctype html><html><head><title>Send events to Axiom</title>
<style>.a { color: red }</style></head>
<body>
<nav><a href="/docs">Docs</a><a href="/blog">Blog</a></nav>
<header><h1>evlog</h1></header>
<${wrapper}>${body}</${wrapper}>
<footer><p>Copyright 2026. Powered by seamless technology.</p></footer>
</body></html>`

describe('extract', () => {
  it('keeps the title and the main region', () => {
    const result = extract(page('<h2>Wire the drain</h2><p>The drain batches events.</p>'))

    expect(result.title).toBe('Send events to Axiom')
    expect(result.markdown).toContain('## Wire the drain')
    expect(result.markdown).toContain('The drain batches events.')
  })

  it('drops the chrome, so its prose never reaches the metrics', () => {
    const result = extract(page('<p>The drain batches events.</p>'))

    expect(result.markdown).not.toContain('seamless')
    expect(result.markdown).not.toContain('Copyright')
  })

  it('falls back through article to body', () => {
    expect(extract(page('<p>In an article.</p>', 'article')).markdown).toContain('In an article.')
    expect(extract('<html><body><p>Bare body.</p></body></html>').markdown).toContain('Bare body.')
  })

  it('rebuilds the structures the metrics depend on', () => {
    const result = extract(page([
      '<p>Read the <a href="/reference/performance">bench numbers</a>.</p>',
      '<ul><li>First</li><li>Second</li></ul>',
      '<pre><code>const logger = createLogger()</code></pre>',
      '<p>Use <code>evlog/toolkit</code> here.</p>',
    ].join('')))
    const doc = parseMarkdown(result.markdown)

    expect(doc.links[0]).toMatchObject({ text: 'bench numbers', href: '/reference/performance' })
    expect(doc.lists[0].items).toHaveLength(2)
    expect(doc.code[0].text).toContain('createLogger')
    expect(doc.inlineCode.map(item => item.token)).toContain('evlog/toolkit')
  })

  it('decodes entities, so an em dash is still found', () => {
    const result = extract(page('<p>The drain retries &mdash; twice &mdash; then drops the batch.</p>'))

    expect(measure(parseMarkdown(result.markdown)).dashes.count).toBe(1)
  })
})
