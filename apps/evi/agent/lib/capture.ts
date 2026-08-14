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

/**
 * Bounds on the viewport height used to frame a selector. The floor keeps a
 * short section from producing a sliver, the ceiling keeps a long one inside
 * the Blob size limit.
 */
export const FRAME_HEIGHT_BOUNDS = { min: 320, max: 2400 } as const

export interface FrameProbe {
  readonly found: boolean
  /** Rendered height of the element, in CSS pixels. */
  readonly height: number
  /** Every `data-section` on the page, offered when the selector missed. */
  readonly hooks: readonly string[]
}

/**
 * JavaScript run in the page to reveal the target and measure it. It scrolls
 * the element into view in the same call, so a section that only animates in
 * on scroll has started before the frame is measured.
 *
 * @param selector - CSS selector framing the change
 */
export function frameProbeExpression(selector: string): string {
  const literal = JSON.stringify(selector)
  return `(() => {
    const el = document.querySelector(${literal})
    if (!el) {
      const hooks = [...document.querySelectorAll('[data-section]')].map(n => n.getAttribute('data-section'))
      return { found: false, height: 0, hooks: [...new Set(hooks)] }
    }
    el.scrollIntoView({ block: 'start' })
    return { found: true, height: Math.ceil(el.getBoundingClientRect().height), hooks: [] }
  })()`
}

/**
 * JavaScript that parks the element's top edge at the top of the viewport.
 * Run after the viewport has been resized to the element, so the frame holds
 * the element and nothing else. `getBoundingClientRect` is viewport-relative,
 * so the page offset has to be added back before scrolling.
 *
 * @param selector - CSS selector framing the change
 */
export function frameParkExpression(selector: string): string {
  const literal = JSON.stringify(selector)
  return `(() => {
    const el = document.querySelector(${literal})
    if (!el) return { found: false }
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY)
    return { found: true }
  })()`
}

/** Reads the agent-browser envelope returned by a probe expression. */
export function readFrameProbe(envelope: unknown): FrameProbe {
  const data = (envelope as { data?: unknown } | null | undefined)?.data
  if (data === null || typeof data !== 'object') {
    throw new Error('The browser returned no frame probe. The page did not load, or the expression failed.')
  }
  const probe = data as Record<string, unknown>
  const hooks = Array.isArray(probe.hooks) ? probe.hooks.filter((hook): hook is string => typeof hook === 'string') : []
  return {
    found: probe.found === true,
    height: typeof probe.height === 'number' ? probe.height : 0,
    hooks,
  }
}

/**
 * The error raised when a selector matches nothing. It names the hooks the
 * page does offer, so the next attempt is a correction rather than a guess.
 */
export function missingSelectorMessage(selector: string, hooks: readonly string[]): string {
  const available = hooks.length === 0
    ? 'That page exposes no [data-section] hooks; add one to the section component before capturing it.'
    : `That page exposes: ${hooks.map(hook => `[data-section="${hook}"]`).join(', ')}.`
  return `The selector "${selector}" matched nothing, so the capture would have framed the top of the page. ${available}`
}

/** Viewport height that frames the element, within the supported bounds. */
export function frameHeight(elementHeight: number): number {
  const { min, max } = FRAME_HEIGHT_BOUNDS
  return Math.min(Math.max(Math.ceil(elementHeight), min), max)
}

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

/**
 * Surfaces that can show real user data: captures of these publish only after
 * an explicit approval, whatever the skill says. evlog.cloud is the hosted
 * product and any telemetry host shows live dashboards.
 */
export function sensitiveCaptureReason(raw: string): string | null {
  const host = new URL(raw).hostname.toLowerCase()
  if (host === 'evlog.cloud' || host.endsWith('.evlog.cloud')) {
    return `${host} is the hosted product and can show real user data.`
  }
  if (host.includes('telemetry')) {
    return `${host} serves telemetry dashboards and can show real user data.`
  }
  return null
}

/**
 * One-line text safe inside the Markdown table and the <sub> receipt: line
 * breaks collapse, and the characters that could open HTML or break the
 * table are escaped.
 */
export function escapeInline(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('|', '\\|')
}

/** Normalized URL for Markdown embedding; parentheses would end the link early. */
export function markdownUrl(raw: string): string {
  return new URL(raw).toString().replaceAll('(', '%28').replaceAll(')', '%29')
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
  const frame = input.selector === null ? 'full viewport' : escapeInline(input.selector)
  return `captured by agent-browser · ${markdownUrl(input.beforeUrl)} → ${markdownUrl(input.afterUrl)} · ${input.viewport} · ${frame} · ${input.capturedAt}`
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
    `| ![before](${markdownUrl(input.beforeImageUrl)}) | ![after](${markdownUrl(input.afterImageUrl)}) |`,
    '',
    escapeInline(input.caption),
    '',
    `<sub>${captureAttestation(input)}</sub>`,
  ].join('\n')
}
