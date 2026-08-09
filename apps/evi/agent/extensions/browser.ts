import browser from '@agent-browser/eve'

/**
 * Browser bounded to evlog's own surfaces. The agent-browser matcher accepts
 * exact hosts and `*.suffix` wildcards only (verified against the CLI), so
 * `*.vercel.app` is the narrowest bound that keeps hash-named preview
 * deployments reachable; a protected preview's redirect to vercel.com falls
 * outside the list and is blocked. Loopback is allowed because the sandbox
 * runs no listener Evi did not start herself. No credential ever lives in the
 * browser: the extension exposes no cookie/storage/auth-state commands.
 */
export default browser({
  allowedDomains: ['evlog.dev', '*.evlog.dev', 'evlog.cloud', '*.evlog.cloud', '*.vercel.app', 'localhost', '127.0.0.1'],
  contentBoundaries: true,
  maxOutputChars: 50_000,
  inlineScreenshots: true,
})
