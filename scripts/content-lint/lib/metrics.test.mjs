import { describe, expect, it } from 'vitest'
import { parseMarkdown } from './mdc.mjs'
import { measure } from './metrics.mjs'

const measureSource = source => measure(parseMarkdown(source))

describe('phrase hits', () => {
  it('locates a hollow superlative with its excerpt', () => {
    const metrics = measureSource('The adapter offers seamless delivery.')

    expect(metrics.phrases).toHaveLength(1)
    expect(metrics.phrases[0].id).toBe('T-01')
    expect(metrics.phrases[0].excerpt).toContain('seamless')
  })

  it('does not fire on a word that merely contains a phrase', () => {
    expect(measureSource('The batch is robustly typed by seamlessness.').phrases).toHaveLength(0)
  })

  it('flags a retired entry point', () => {
    const hits = measureSource('Import the helper from `evlog/shared`.').phrases

    expect(hits.map(hit => hit.id)).toContain('T-15')
  })
})

describe('epigrams', () => {
  it('counts a short closing line that carries nothing', () => {
    const metrics = measureSource('The pipeline batches every event before it leaves the process. That is the whole idea.')

    expect(metrics.epigrams.count).toBe(1)
  })

  it('spares a closer that carries a number', () => {
    const metrics = measureSource('The pipeline batches every event before it leaves the process. It retries 3 times.')

    expect(metrics.epigrams.count).toBe(0)
  })

  it('spares a closer that points somewhere', () => {
    const metrics = measureSource('Redaction masks PII before any drain receives it. See [Auto-Redaction](/learn/redaction).')

    expect(metrics.epigrams.count).toBe(0)
  })
})

describe('dashes', () => {
  it('locates every em dash with the sentence holding it', () => {
    const metrics = measureSource('The drain retries — twice — before dropping. Nothing else changes.')

    expect(metrics.dashes.count).toBe(1)
    expect(metrics.dashes.occurrences[0].text).toContain('retries')
  })

  it('counts en dashes too', () => {
    expect(measureSource('The window is 5–10 seconds wide.').dashes.count).toBe(1)
  })

  it('leaves a hyphen alone', () => {
    expect(measureSource('Use the drop-in adapter.').dashes.count).toBe(0)
  })
})

describe('headings', () => {
  it('reports the dominant grammatical shape', () => {
    const metrics = measureSource('## Set the drain\n\ntext\n\n## Send the batch\n\ntext\n\n## Verify the output\n\ntext\n')

    expect(metrics.headings.dominant).toBe('imperative')
    expect(metrics.headings.share).toBe(1)
  })
})

describe('contraction seam', () => {
  it('measures the sharpest jump between adjacent paragraphs', () => {
    const source = [
      "You don't need a transport. You won't write glue either.",
      '',
      'You do not need a transport. It is not required.',
    ].join('\n')

    expect(measureSource(source).contractionSeam.delta).toBe(1)
  })
})

describe('unbacked sections', () => {
  it('flags a section that asserts behavior with nothing to check', () => {
    const filler = 'The system handles high throughput and keeps overhead low for demanding workloads. '
    const metrics = measureSource(`## Performance\n\n${filler.repeat(8)}\n`)

    expect(metrics.unbackedSections.map(section => section.heading)).toEqual(['Performance'])
  })

  it('spares a section carrying a code sample', () => {
    const filler = 'The system handles high throughput and keeps overhead low for demanding workloads. '
    const metrics = measureSource(`## Performance\n\n${filler.repeat(8)}\n\n\`\`\`ts\nconst a = 1\n\`\`\`\n`)

    expect(metrics.unbackedSections).toHaveLength(0)
  })

  it('counts a bullet as evidence, and as words', () => {
    const filler = 'The system handles high throughput and keeps overhead low for demanding workloads. '
    const measured = measureSource(`## Performance\n\n${filler.repeat(8)}\n\n- Flushes every 2 seconds\n`)
    const bulletsOnly = measureSource(`## Performance\n\n${Array.from({ length: 12 }, () => '- The system handles high throughput and keeps the overhead low for demanding workloads').join('\n')}\n`)

    expect(measured.unbackedSections).toHaveLength(0)
    expect(bulletsOnly.unbackedSections.map(section => section.heading)).toEqual(['Performance'])
  })
})
