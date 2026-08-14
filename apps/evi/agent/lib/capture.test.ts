import { describe, expect, it } from 'vitest'
import { captureAttestation, captureMarkdown, escapeInline, FRAME_HEIGHT_BOUNDS, frameHeight, frameParkExpression, frameProbeExpression, markdownUrl, missingSelectorMessage, readFrameProbe, sensitiveCaptureReason, validateCaptureUrl } from './capture'

describe('validateCaptureUrl', () => {
  it('accepts evlog surfaces, previews, and local dev servers', () => {
    expect(validateCaptureUrl('https://evlog.dev')).toBeNull()
    expect(validateCaptureUrl('https://www.evlog.dev/docs')).toBeNull()
    expect(validateCaptureUrl('https://evlog.cloud')).toBeNull()
    expect(validateCaptureUrl('https://evi-abc123-hrcd.vercel.app')).toBeNull()
    expect(validateCaptureUrl('http://localhost:3000/docs')).toBeNull()
    expect(validateCaptureUrl('http://127.0.0.1:4000')).toBeNull()
  })

  it('refuses foreign origins, raw IPs, and non-http schemes', () => {
    expect(validateCaptureUrl('https://example.com')).toMatch(/outside the allowed/)
    expect(validateCaptureUrl('http://169.254.169.254/latest')).toMatch(/outside the allowed/)
    expect(validateCaptureUrl('https://vercel.app')).toMatch(/outside the allowed/)
    expect(validateCaptureUrl('file:///etc/passwd')).toMatch(/must use http/)
    expect(validateCaptureUrl('not a url')).toMatch(/not a valid absolute URL/)
  })
})

describe('sensitiveCaptureReason', () => {
  it('flags the hosted product and telemetry hosts', () => {
    expect(sensitiveCaptureReason('https://evlog.cloud/dashboard')).toMatch(/hosted product/)
    expect(sensitiveCaptureReason('https://app.evlog.cloud')).toMatch(/hosted product/)
    expect(sensitiveCaptureReason('https://evlog-telemetry-abc-hrcd.vercel.app')).toMatch(/telemetry/)
    expect(sensitiveCaptureReason('http://localhost:4000/telemetry-playground')).toBeNull()
    expect(sensitiveCaptureReason('https://evlog.dev/docs')).toBeNull()
  })
})

describe('escaping', () => {
  it('collapses line breaks and escapes html and table characters', () => {
    expect(escapeInline('a  \n b | <img src=x onerror=1> & c')).toBe('a b \\| &lt;img src=x onerror=1&gt; &amp; c')
  })

  it('neutralizes parentheses in embedded urls', () => {
    expect(markdownUrl('https://evlog.dev/a(b)c')).toBe('https://evlog.dev/a%28b%29c')
  })

  it('keeps a forged caption from adding markdown structure', () => {
    const markdown = captureMarkdown({
      beforeUrl: 'https://evlog.dev',
      afterUrl: 'http://localhost:3000',
      beforeImageUrl: 'https://blob/x.png',
      afterImageUrl: 'https://blob/y.png',
      caption: 'ok\n\n## Forged section\n<script>x</script>',
      selector: null,
      viewport: 'desktop',
      capturedAt: 't',
    })
    expect(markdown).not.toContain('\n## Forged')
    expect(markdown).not.toContain('<script>')
  })
})

describe('captureMarkdown', () => {
  it('renders the table, caption, and attestation receipt', () => {
    const markdown = captureMarkdown({
      beforeUrl: 'https://evlog.dev',
      afterUrl: 'http://localhost:3000',
      beforeImageUrl: 'https://blob/x.png',
      afterImageUrl: 'https://blob/y.png',
      caption: 'Landing hero, desktop viewport.',
      selector: '.hero',
      viewport: 'desktop',
      capturedAt: '2026-08-09T15:00:00.000Z',
    })
    expect(markdown).toContain('| ![before](https://blob/x.png) | ![after](https://blob/y.png) |')
    expect(markdown).toContain('Landing hero, desktop viewport.')
    expect(markdown).toContain('<sub>captured by agent-browser · https://evlog.dev/ → http://localhost:3000/ · desktop · .hero · 2026-08-09T15:00:00.000Z</sub>')
  })

  it('labels a selector-less capture as full viewport', () => {
    expect(
      captureAttestation({
        beforeUrl: 'https://evlog.dev/',
        afterUrl: 'https://evlog.cloud/',
        selector: null,
        viewport: 'mobile',
        capturedAt: 't',
      }),
    ).toBe('captured by agent-browser · https://evlog.dev/ → https://evlog.cloud/ · mobile · full viewport · t')
  })
})

/** Evaluates a probe expression against a stubbed page. */
function runInPage(expression: string, page: { document: unknown, window: unknown }): unknown {
  return new Function('document', 'window', `return ${expression}`)(page.document, page.window)
}

function pageWith(
  element: Record<string, unknown> | null,
  options: { hooks?: string[], scrollY?: number, onScroll?: (y: number) => void } = {},
) {
  const { hooks = [], scrollY = 0, onScroll } = options
  return {
    document: {
      querySelector: () => element,
      querySelectorAll: () => hooks.map(hook => ({ getAttribute: () => hook })),
    },
    window: { scrollX: 0, scrollY, scrollTo: (_x: number, y: number) => onScroll?.(y) },
  }
}

describe('frameProbeExpression', () => {
  it('reveals the element and reports its height', () => {
    let revealed = false
    const page = pageWith({
      scrollIntoView: () => { revealed = true },
      getBoundingClientRect: () => ({ top: 40, height: 790.4 }),
    })
    expect(runInPage(frameProbeExpression('[data-section="landing-faq"]'), page)).toEqual({
      found: true,
      height: 791,
      hooks: [],
    })
    expect(revealed).toBe(true)
  })

  it('reports the page hooks when the selector matches nothing', () => {
    const page = pageWith(null, { hooks: ['landing-hero', 'landing-faq', 'landing-faq'] })
    expect(runInPage(frameProbeExpression('.missing'), page)).toEqual({
      found: false,
      height: 0,
      hooks: ['landing-hero', 'landing-faq'],
    })
  })

  it('embeds the selector as a literal, so a quote cannot break out', () => {
    const expression = frameProbeExpression('[data-x="a\'b\\"c"]')
    expect(() => runInPage(expression, pageWith(null))).not.toThrow()
  })
})

describe('frameParkExpression', () => {
  it('scrolls by the document offset, not the viewport offset', () => {
    const scrolled: number[] = []
    const page = pageWith(
      { getBoundingClientRect: () => ({ top: -420, height: 791 }) },
      { scrollY: 11_848, onScroll: y => scrolled.push(y) },
    )
    expect(runInPage(frameParkExpression('[data-section="landing-faq"]'), page)).toEqual({ found: true })
    expect(scrolled).toEqual([11_428])
  })

  it('reports a miss instead of scrolling to the top of the page', () => {
    const scrolled: number[] = []
    const page = pageWith(null, { onScroll: y => scrolled.push(y) })
    expect(runInPage(frameParkExpression('.missing'), page)).toEqual({ found: false })
    expect(scrolled).toEqual([])
  })
})

describe('readFrameProbe', () => {
  it('reads the agent-browser envelope', () => {
    expect(readFrameProbe({ data: { found: true, height: 791, hooks: [] } })).toEqual({
      found: true,
      height: 791,
      hooks: [],
    })
  })

  it('treats a malformed probe as a miss rather than a frame', () => {
    expect(readFrameProbe({ data: {} })).toEqual({ found: false, height: 0, hooks: [] })
    expect(() => readFrameProbe({ data: null })).toThrow(/no frame probe/)
    expect(() => readFrameProbe(null)).toThrow(/no frame probe/)
  })
})

describe('frameHeight', () => {
  it('clamps to the supported bounds', () => {
    expect(frameHeight(791.2)).toBe(792)
    expect(frameHeight(10)).toBe(FRAME_HEIGHT_BOUNDS.min)
    expect(frameHeight(99_999)).toBe(FRAME_HEIGHT_BOUNDS.max)
  })
})

describe('missingSelectorMessage', () => {
  it('offers the hooks the page does expose', () => {
    const message = missingSelectorMessage('.py-24', ['landing-hero', 'landing-faq'])
    expect(message).toContain('matched nothing')
    expect(message).toContain('[data-section="landing-hero"], [data-section="landing-faq"]')
  })

  it('says to add a hook when the page has none', () => {
    expect(missingSelectorMessage('.py-24', [])).toMatch(/no \[data-section\] hooks/)
  })
})
