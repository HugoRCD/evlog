/**
 * Single source of truth for where the browser — and any capture — may go:
 * evlog's own surfaces, Vercel previews, and sandbox-local dev servers. The
 * agent-browser matcher accepts exact hosts and `*.suffix` wildcards only.
 */
export const ALLOWED_BROWSER_DOMAINS = [
  'evlog.dev',
  '*.evlog.dev',
  'evlog.cloud',
  '*.evlog.cloud',
  '*.vercel.app',
  'localhost',
  '127.0.0.1',
] as const

export const CAPTURE_VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
} as const

export type CaptureViewport = keyof typeof CAPTURE_VIEWPORTS

/** Entrance animations and font swaps settle before the frame is taken. */
export const CAPTURE_SETTLE_MS = 5000

/** Returns the refusal reason, or null when the URL may be captured. */
export function validateCaptureUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  }
  catch {
    return `"${raw}" is not a valid absolute URL.`
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return `"${raw}" must use http(s).`
  }
  const host = url.hostname.toLowerCase()
  const allowed = ALLOWED_BROWSER_DOMAINS.some(pattern =>
    pattern.startsWith('*.') ? host.endsWith(pattern.slice(1)) : host === pattern,
  )
  return allowed ? null : `"${host}" is outside the allowed capture origins.`
}

interface AttestationInput {
  readonly afterUrl: string
  readonly beforeUrl: string
  readonly capturedAt: string
  readonly selector: string | null
  readonly viewport: CaptureViewport
}

/** Human-readable receipt embedded under the comparison table. */
export function captureAttestation(input: AttestationInput): string {
  const frame = input.selector ?? 'full viewport'
  return `captured by agent-browser · ${input.beforeUrl} → ${input.afterUrl} · ${input.viewport} · ${frame} · ${input.capturedAt}`
}

/** The finished markdown block: table, caption, attestation receipt. */
export function captureMarkdown(input: AttestationInput & {
  readonly afterImageUrl: string
  readonly beforeImageUrl: string
  readonly caption: string
}): string {
  return [
    '| Before | After |',
    '| --- | --- |',
    `| ![before](${input.beforeImageUrl}) | ![after](${input.afterImageUrl}) |`,
    '',
    `${input.caption}`,
    '',
    `<sub>${captureAttestation(input)}</sub>`,
  ].join('\n')
}
