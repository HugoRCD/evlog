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
    expect(measureSource('The drain retries – then it drops the batch.').dashes.count).toBe(1)
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

  it('reads a heading opening on an interrogative as a question', () => {
    const titles = ['Where the byte counts come from', 'Which number moves your bill', 'What a retained event costs']
    const source = titles.map(title => `## ${title}\n\nProse under it.`).join('\n\n')

    expect(measureSource(source).headings.dominant).toBe('question')
  })

  it('leaves evlog\'s own nouns out of the verb list', () => {
    const titles = ['Route filtering', 'Trace context', 'Drain pipeline']
    const source = titles.map(title => `## ${title}\n\nProse under it.`).join('\n\n')

    expect(measureSource(source).headings.dominant).toBe('noun')
  })

  it('reads a heading opening on a symbol as an API entry', () => {
    const source = ['## `getMetadata()`: final snapshot', '## `getEstimatedCost()`: quick check', '## `onUpdate()`: incremental', '## `shape`: the record'].map(h => `${h}\n\nProse about it.`).join('\n\n')

    expect(measureSource(source).headings.dominant).toBe('symbol')
  })
})

describe('contraction seam', () => {
  it('ignores two registers at opposite ends of a page', () => {
    const far = Array.from({ length: 6 }, () => 'A table row and a code fence sit here, with nothing to contract.')
    const source = ["You don't need a transport. You won't write glue either.", ...far, 'You do not need a transport. It is not required.'].join('\n\n')

    expect(measureSource(source).contractionSeam).toBeNull()
  })

  it('measures the sharpest jump between adjacent paragraphs', () => {
    const source = [
      "You don't need a transport. You won't write glue either.",
      '',
      'You do not need a transport. It is not required.',
    ].join('\n')

    expect(measureSource(source).contractionSeam.delta).toBe(1)
  })
})

describe('dashes, twins', () => {
  it('reads a dash between two numbers as a range', () => {
    expect(measureSource('Manifest mode is ~30–80 lines of glue.').dashes.count).toBe(0)
  })

  it('counts a dash hiding in a heading', () => {
    // Headings never reached this metric, so 46 of them carried one.
    expect(measureSource('## Network bridge — stream server\n\nProse.').dashes.count).toBe(1)
  })

  it('counts a dash hiding in a bullet', () => {
    expect(measureSource('- Skip on serverless — the stream is in-process').dashes.count).toBe(1)
  })
})

describe('bullet frames, symbols', () => {
  it('reads a bolded symbol as the symbol it is', () => {
    const items = ['`message`', '`evlog`', '`dd`', '`service`', '`timestamp`']
    const source = items.map(name => `- **${name}**: what the field carries and why`).join('\n')

    expect(measureSource(source).bulletFrames).toEqual([])
  })
})

describe('epigrams, twins', () => {
  it('leaves a card body out of the rhythm', () => {
    const source = ['::card-group', '  :::card', '  ---', '  title: Nuxt', '  ---', '  Auto-imported helpers. Zero config.', '  :::', '::'].join('\n')

    expect(measureSource(source).epigrams.eligible).toBe(0)
  })

  it('spares a closer that introduces what comes next', () => {
    const source = 'Some categories never belong in an event, whatever the environment. **Never log:**\n\n| Category | Risk |\n| --- | --- |\n| Credentials | Account compromise |'

    expect(measureSource(source).epigrams.count).toBe(0)
  })

  it('still counts a closer that only carries rhythm', () => {
    const source = 'The pipeline batches every event before it leaves the process. That is the whole idea.'

    expect(measureSource(source).epigrams.count).toBe(1)
  })
})

describe('bullet frames', () => {
  it('does not read a checklist as an anaphora', () => {
    // Every task item starts with `[`, which is a checkbox. `score.mjs` gates
    // T-07 on this share, so it is the number that has to stay low.
    const list = ['- [ ] Service name is set', '- [ ] Sampling is configured for the busiest routes', '- [ ] Draining is set up', '- [ ] Pretty mode is off in production'].join('\n')
    const frames = measureSource(list).bulletFrames

    for (const frame of frames) expect(frame.anaphoraShare).toBeLessThan(0.75)
  })

  it('reports the share over the openers it actually counted', () => {
    // Lengths deliberately uneven, so the frame can only come from the opener.
    const list = [
      '- Powerful drain support for absolutely every destination you might ever reach for',
      '- Powerful enrichers',
      '- Powerful catalogs that carry a code and a fix and a link',
      '- Powerful sampling',
      '- Powerful redaction across every nested field',
    ].join('\n')
    const [frame] = measureSource(list).bulletFrames

    expect(frame.anaphoraShare).toBe(1)
    expect(frame.opening).toBe(5)
    expect(frame.items).toBe(5)
  })

  it('reads the word after the ordinal, which the parser has already removed', () => {
    const numbered = ['1. Explicit overrides win', '2. Runtime config', '3. Legacy config', '4. Env vars', '5. Defaults'].join('\n')
    const [frame] = measureSource(numbered).bulletFrames ?? []

    expect(frame?.anaphoraShare ?? 0).toBeLessThan(0.75)
  })

  it('leaves the code placeholder out of the population', () => {
    const linked = ['- `evlog agents` runs the guidelines', '- `evlog doctor` confirms the wiring', '- `evlog map` scores what is dark'].join('\n')

    expect(measureSource(linked).bulletFrames).toEqual([])
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
