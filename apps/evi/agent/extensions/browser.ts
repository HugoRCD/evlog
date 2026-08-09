import browser from '@agent-browser/eve'

/**
 * Browser bounded to evlog's own surfaces: the production site, Vercel
 * previews, and dev servers started inside the sandbox. Widen only on
 * evidence that a page's own sub-resources are blocked.
 */
export default browser({
  allowedDomains: ['evlog.dev', '*.evlog.dev', 'evlog.cloud', '*.evlog.cloud', '*.vercel.app', 'localhost', '127.0.0.1'],
  contentBoundaries: true,
  maxOutputChars: 50_000,
  inlineScreenshots: true,
})
