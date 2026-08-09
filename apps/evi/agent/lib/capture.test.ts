import { describe, expect, it } from 'vitest'
import { captureAttestation, captureMarkdown, validateCaptureUrl } from './capture'

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
    expect(markdown).toContain('<sub>captured by agent-browser · https://evlog.dev → http://localhost:3000 · desktop · .hero · 2026-08-09T15:00:00.000Z</sub>')
  })

  it('labels a selector-less capture as full viewport', () => {
    expect(
      captureAttestation({
        beforeUrl: 'a',
        afterUrl: 'b',
        selector: null,
        viewport: 'mobile',
        capturedAt: 't',
      }),
    ).toBe('captured by agent-browser · a → b · mobile · full viewport · t')
  })
})
