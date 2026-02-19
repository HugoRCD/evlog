'use client'

import { useState, useCallback, useEffect } from 'react'
import { log, setIdentity, clearIdentity } from 'evlog/next/client'
import { parseError } from 'evlog'
import { createBrowserLogDrain } from 'evlog/browser'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TestConfig {
  id: string
  label: string
  description?: string
  endpoint?: string
  method?: 'GET' | 'POST'
  onClick?: (addToast: (toast: Toast) => void) => void | Promise<void>
  color?: string
  badge?: string
  showResult?: boolean
}

interface TestSection {
  id: string
  label: string
  title: string
  description: string
  tests: TestConfig[]
}

interface Toast {
  id: string
  title: string
  description?: string
  color: 'success' | 'error' | 'warning' | 'info'
  action?: { label: string, href: string }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDrainEvent(overrides?: Record<string, unknown>) {
  return {
    event: {
      level: 'info' as const,
      service: 'next-playground',
      environment: 'development',
      timestamp: new Date().toISOString(),
      action: 'browser_drain_test',
      ...overrides,
    },
    request: { method: 'GET', path: '/browser', requestId: crypto.randomUUID() },
    headers: {},
  }
}

// ---------------------------------------------------------------------------
// Test sections config
// ---------------------------------------------------------------------------

const sections: TestSection[] = [
  {
    id: 'client-logging',
    label: 'Client Logging',
    title: 'Client-side Logging',
    description: 'These logs appear in the browser console with pretty formatting and are transported to the server via POST /api/evlog/ingest.',
    tests: [
      {
        id: 'client-info',
        label: 'log.info()',
        description: 'Log informational messages to the browser console with structured data',
        onClick: () => log.info({ action: 'test_client', timestamp: Date.now() }),
        badge: 'Info',
      },
      {
        id: 'client-tagged',
        label: 'log.info(tag, msg)',
        description: 'Tagged log with a string label and message',
        onClick: () => log.info('checkout', 'User clicked buy'),
        badge: 'Tagged',
      },
      {
        id: 'client-warn',
        label: 'log.warn()',
        description: 'Log warning messages for non-critical issues',
        color: 'warning',
        onClick: () => log.warn({ action: 'slow_render', component: 'ProductList', duration: 2500 }),
        badge: 'Warning',
      },
      {
        id: 'client-error',
        label: 'log.error()',
        description: 'Log error messages for caught exceptions',
        color: 'error',
        onClick: () => log.error({ action: 'api_failure', endpoint: '/api/products', error: 'Request timeout after 5000ms' }),
        badge: 'Error',
      },
    ],
  },
  {
    id: 'identity',
    label: 'Identity',
    title: 'Client Identity',
    description: 'Attach user identity to all client logs via setIdentity(). Identity fields are included in every log and transported to the server.',
    tests: [
      {
        id: 'identity-set',
        label: 'setIdentity()',
        description: 'Sets userId and orgId on all future client logs',
        onClick: () => {
          setIdentity({ userId: 'usr_123', orgId: 'org_456' })
          log.info({ action: 'identity_set', message: 'Identity set to usr_123 / org_456' })
        },
        badge: 'setIdentity',
      },
      {
        id: 'identity-log',
        label: 'log.info() with identity',
        description: 'Emits a log — identity fields (userId, orgId) are automatically included',
        onClick: () => log.info({ action: 'checkout', item: 'pro_plan' }),
        badge: 'Auto-enriched',
        color: 'success',
      },
      {
        id: 'identity-clear',
        label: 'clearIdentity()',
        description: 'Clears identity context. Future logs will no longer include userId/orgId',
        color: 'error',
        onClick: () => {
          clearIdentity()
          log.info({ action: 'identity_cleared', message: 'Identity context cleared' })
        },
        badge: 'clearIdentity',
      },
    ],
  },
  {
    id: 'wide-events',
    label: 'Wide Events',
    title: 'Server-side Wide Events',
    description: 'These calls trigger API endpoints that use withEvlog() + useLogger() to build wide events. Check the terminal for structured output.',
    tests: [
      {
        id: 'api-checkout',
        label: 'POST /api/checkout',
        description: 'Checkout with wide event context (user, cart, payment)',
        endpoint: '/api/checkout',
        method: 'POST',
        color: 'success',
        badge: 'checkout-service',
        showResult: true,
      },
      {
        id: 'api-health',
        label: 'GET /api/health',
        description: 'Health check — simple response with minimal logging',
        endpoint: '/api/health',
        method: 'GET',
        badge: 'default-service',
        showResult: true,
      },
      {
        id: 'api-auth',
        label: 'POST /api/auth/login',
        description: 'Login endpoint with auth-service route matching',
        endpoint: '/api/auth/login',
        method: 'POST',
        badge: 'auth-service',
        showResult: true,
      },
      {
        id: 'api-wide-event',
        label: 'GET /api/test/wide-event',
        description: '6-stage wide event: user, session, cart, checkout, inventory, performance',
        endpoint: '/api/test/wide-event',
        method: 'GET',
        color: 'success',
        badge: 'Multi-stage',
        showResult: true,
      },
      {
        id: 'api-success',
        label: 'GET /api/test/success',
        description: 'Async workflow: upload → validate → scan → store with staged logging',
        endpoint: '/api/test/success',
        method: 'GET',
        badge: 'Async Workflow',
        showResult: true,
      },
      {
        id: 'api-error',
        label: 'GET /api/test/error',
        description: 'Payment flow that fails with logger.error() + createEvlogError()',
        endpoint: '/api/test/error',
        method: 'GET',
        color: 'error',
        badge: 'Error Flow',
        showResult: true,
      },
    ],
  },
  {
    id: 'structured-errors',
    label: 'Structured Errors',
    title: 'Structured Error → Toast',
    description: 'Demonstrates how a structured createEvlogError() from the backend can be caught with parseError() and displayed as a rich toast with context (message, why, fix, link).',
    tests: [
      {
        id: 'structured-error-toast',
        label: 'Trigger API Error',
        description: 'Server returns a structured EvlogError (402). Client uses parseError() to extract message, why, fix, and link fields.',
        color: 'error',
        onClick: async (addToast) => {
          try {
            const res = await fetch('/api/test/structured-error')
            const data = await res.json()
            if (!res.ok) {
              // Use parseError to extract structured fields
              const error = parseError({ data, statusCode: res.status })
              addToast({
                id: crypto.randomUUID(),
                title: error.message,
                description: error.why,
                color: 'error',
                action: error.link ? { label: 'Learn more', href: error.link } : undefined,
              })
              if (error.fix) {
                console.info(`Fix: ${error.fix}`)
              }
            }
          } catch (err) {
            const error = parseError(err)
            addToast({
              id: crypto.randomUUID(),
              title: error.message,
              color: 'error',
            })
          }
        },
        badge: 'parseError()',
      },
    ],
  },
  {
    id: 'pipeline',
    label: 'Pipeline',
    title: 'Drain Pipeline',
    description: 'Test the drain pipeline with batching. Config: batch size 5, interval 2s. Watch the terminal — events are buffered and flushed in batches.',
    tests: [
      {
        id: 'pipeline-single',
        label: '1 Request (buffered)',
        description: 'Single request — buffered in pipeline, flushed after interval or when batch fills',
        endpoint: '/api/test/drain',
        method: 'GET',
        badge: 'Buffered',
        showResult: true,
      },
      {
        id: 'pipeline-batch',
        label: 'Fire 10 Requests (2 batches)',
        description: 'Fire 10 requests — should produce 2 batches of 5 in the terminal',
        color: 'success',
        onClick: async () => {
          await Promise.all(
            Array.from({ length: 10 }, () => fetch('/api/test/drain')),
          )
        },
        badge: 'batch.size = 5',
      },
    ],
  },
  {
    id: 'browser-drain',
    label: 'Browser Drain',
    title: 'Browser Log Drain',
    description: 'Send structured log events from the browser directly to the server. Uses evlog/browser createBrowserLogDrain for batched transport via fetch/sendBeacon.',
    tests: [
      {
        id: 'browser-drain-quick',
        label: 'Quick Setup',
        description: 'Create a browser drain, log one event, and manually flush to /api/test/browser-ingest',
        onClick: async () => {
          const drain = createBrowserLogDrain({
            drain: { endpoint: '/api/test/browser-ingest' },
            pipeline: { batch: { size: 1, intervalMs: 500 } },
          })
          drain(makeDrainEvent({ action: 'quick_setup_test' }))
          await drain.flush()
        },
        badge: 'createBrowserLogDrain',
      },
      {
        id: 'browser-drain-batch',
        label: 'Batch 5 Events',
        description: 'Push 5 events into the browser drain and flush — appears as one batch on the server',
        color: 'success',
        onClick: async () => {
          const drain = createBrowserLogDrain({
            drain: { endpoint: '/api/test/browser-ingest' },
            pipeline: { batch: { size: 5, intervalMs: 10000 } },
          })
          for (let i = 0; i < 5; i++) {
            drain(makeDrainEvent({ action: `batch_event_${i + 1}`, index: i }))
          }
          await drain.flush()
        },
        badge: 'batch.size = 5',
      },
      {
        id: 'browser-drain-beacon',
        label: 'Auto-flush (sendBeacon)',
        description: 'Events are auto-flushed via sendBeacon when the page becomes hidden (switch tabs to test)',
        color: 'warning',
        onClick: async () => {
          const drain = createBrowserLogDrain({
            drain: { endpoint: '/api/test/browser-ingest' },
            pipeline: { batch: { size: 25, intervalMs: 60000 } },
            autoFlush: true,
          })
          drain(makeDrainEvent({ action: 'beacon_test', note: 'switch tabs to trigger sendBeacon flush' }))
        },
        badge: 'sendBeacon',
      },
    ],
  },
  {
    id: 'drains',
    label: 'Drains',
    title: 'Drain Adapters',
    description: 'Test the full drain pipeline end-to-end. Events flow through enrich → pipeline → drain. Check your terminal for [DRAIN] output.',
    tests: [
      {
        id: 'drain-emit',
        label: 'Emit Drain Event',
        description: 'Sets context, emits wide event through the full pipeline. Watch for [DRAIN] in terminal.',
        endpoint: '/api/test/drain',
        method: 'GET',
        color: 'success',
        badge: 'Full Pipeline',
        showResult: true,
      },
    ],
  },
  {
    id: 'tail-sampling',
    label: 'Tail Sampling',
    title: 'Tail Sampling',
    description: 'Test how tail sampling rescues logs that would be dropped by head sampling. Config: rates: { info: 10 } (only 10% logged by default).',
    tests: [
      {
        id: 'tail-fast-single',
        label: '1 Fast Request',
        description: 'Fast requests — only ~10% will appear in logs',
        endpoint: '/api/test/tail-sampling/fast',
        method: 'GET',
        color: 'neutral',
        badge: 'Head Sampling (10%)',
      },
      {
        id: 'tail-fast-batch',
        label: '20 Fast Requests',
        description: 'Fire 20 requests — only ~10% should be logged',
        color: 'neutral',
        onClick: async () => {
          await Promise.all(
            Array.from({ length: 20 }, () => fetch('/api/test/tail-sampling/fast')),
          )
        },
        badge: 'Head Sampling (10%)',
      },
      {
        id: 'tail-slow',
        label: 'Slow Request (600ms)',
        description: 'Slow requests — always logged (duration >= 500ms)',
        endpoint: '/api/test/tail-sampling/slow',
        method: 'GET',
        color: 'warning',
        badge: 'Tail: Duration >= 500ms',
      },
      {
        id: 'tail-error',
        label: 'Error Request (404)',
        description: 'Error responses — always logged (status >= 400)',
        endpoint: '/api/test/tail-sampling/error',
        method: 'GET',
        color: 'error',
        badge: 'Tail: Status >= 400',
      },
      {
        id: 'tail-critical',
        label: 'Critical Path',
        description: 'Path /api/test/critical/** — always logged via path pattern',
        endpoint: '/api/test/critical/important',
        method: 'GET',
        color: 'warning',
        badge: 'Tail: Path Pattern',
        showResult: true,
      },
      {
        id: 'tail-premium',
        label: 'Premium User',
        description: 'Custom keep() callback — premium users always logged',
        endpoint: '/api/test/tail-sampling/premium',
        method: 'GET',
        color: 'success',
        badge: 'keep() Callback',
        showResult: true,
      },
    ],
  },
  {
    id: 'services',
    label: 'Services',
    title: 'Service Routing',
    description: 'Test route-based service names. Each route pattern maps to a service name in the wide event. Check the terminal for [auth-service], [checkout-service], etc.',
    tests: [
      {
        id: 'service-auth',
        label: 'POST /api/auth/login',
        description: 'Routes matching /api/auth/** → auth-service',
        endpoint: '/api/auth/login',
        method: 'POST',
        badge: '/api/auth/**',
        showResult: true,
      },
      {
        id: 'service-checkout',
        label: 'POST /api/checkout',
        description: 'Routes matching /api/checkout/** → checkout-service',
        endpoint: '/api/checkout',
        method: 'POST',
        color: 'success',
        badge: '/api/checkout/**',
        showResult: true,
      },
      {
        id: 'service-default',
        label: 'GET /api/health',
        description: 'Unmatched routes use the default service name',
        endpoint: '/api/health',
        method: 'GET',
        color: 'neutral',
        badge: 'env.service fallback',
        showResult: true,
      },
      {
        id: 'service-payment',
        label: 'POST /api/payment/process',
        description: 'Routes matching /api/payment/** → payment-service',
        endpoint: '/api/payment/process',
        method: 'POST',
        color: 'success',
        badge: '/api/payment/**',
        showResult: true,
      },
      {
        id: 'service-booking',
        label: 'POST /api/booking/create',
        description: 'Routes matching /api/booking/** → booking-service',
        endpoint: '/api/booking/create',
        method: 'POST',
        badge: '/api/booking/**',
        showResult: true,
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

const accentColors: Record<string, string> = {
  primary: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  neutral: '#71717a',
}

function getAccentColor(color?: string): string {
  return accentColors[color || 'primary'] || accentColors.primary
}

const toastBorderColors: Record<string, string> = {
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
}

// ---------------------------------------------------------------------------
// Toast component
// ---------------------------------------------------------------------------

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[], onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        zIndex: 50,
        maxWidth: '24rem',
      }}
    >
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast, onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div
      style={{
        background: '#18181b',
        border: '1px solid #27272a',
        borderLeft: `3px solid ${toastBorderColors[toast.color]}`,
        borderRadius: '0.5rem',
        padding: '0.875rem 1rem',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#fafafa', margin: 0 }}>
            {toast.title}
          </p>
          {toast.description && (
            <p style={{ fontSize: '0.75rem', color: '#a1a1aa', margin: '0.25rem 0 0', lineHeight: 1.4 }}>
              {toast.description}
            </p>
          )}
          {toast.action && (
            <a
              href={toast.action.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                marginTop: '0.5rem',
                fontSize: '0.75rem',
                color: '#3b82f6',
                textDecoration: 'none',
              }}
            >
              {toast.action.label} →
            </a>
          )}
        </div>
        <button
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: '#52525b',
            cursor: 'pointer',
            fontSize: '1rem',
            padding: 0,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Test card component
// ---------------------------------------------------------------------------

function TestCard({
  test,
  loading,
  result,
  error,
  onRun,
}: {
  test: TestConfig
  loading: boolean
  result: unknown
  error: unknown
  onRun: () => void
}) {
  const accent = getAccentColor(test.color)
  const hasResult = test.showResult && (result !== undefined || error !== undefined)

  return (
    <div
      style={{
        background: '#18181b',
        border: '1px solid #27272a',
        borderLeft: `2px solid ${accent}`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        onClick={onRun}
        style={{
          padding: '1rem',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          cursor: 'pointer',
          position: 'relative',
        }}
      >
        {loading && (
          <span style={{ position: 'absolute', top: '1rem', right: '1rem', color: '#3b82f6', fontSize: '0.75rem' }}>
            ●
          </span>
        )}

        {test.badge && (
          <span
            style={{
              display: 'inline-block',
              width: 'fit-content',
              padding: '0.125rem 0.5rem',
              fontSize: '0.6875rem',
              background: '#27272a',
              color: '#a1a1aa',
              borderRadius: '0.25rem',
              marginBottom: '0.625rem',
            }}
          >
            {test.badge}
          </span>
        )}

        <h3 style={{ fontSize: '0.875rem', fontWeight: 500, color: '#fafafa', lineHeight: 1.4 }}>
          {test.label}
        </h3>

        {test.description && (
          <p style={{ fontSize: '0.75rem', color: '#71717a', lineHeight: 1.5, marginTop: '0.375rem' }}>
            {test.description}
          </p>
        )}
      </div>

      {hasResult && (
        <div style={{ padding: '0 1rem 1rem' }}>
          <span style={{ fontSize: '0.6875rem', fontWeight: 500, color: '#71717a' }}>
            {error ? 'Error' : 'Response'}
          </span>
          <pre
            style={{
              fontSize: '0.6875rem',
              padding: '0.75rem',
              borderRadius: '0.25rem',
              overflow: 'auto',
              maxHeight: '8rem',
              marginTop: '0.5rem',
              background: error ? 'rgba(239, 68, 68, 0.1)' : '#111',
              color: error ? '#ef4444' : '#a1a1aa',
              border: error ? '1px solid rgba(239, 68, 68, 0.2)' : 'none',
            }}
          >
            {JSON.stringify(error || result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Home() {
  const [activeSection, setActiveSection] = useState(sections[0].id)
  const [testStates, setTestStates] = useState<Record<string, { loading: boolean, result?: unknown, error?: unknown }>>({})
  const [toasts, setToasts] = useState<Toast[]>([])

  const currentSection = sections.find(s => s.id === activeSection)!

  const addToast = useCallback((toast: Toast) => {
    setToasts(prev => [...prev, toast])
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const runTest = useCallback(async (test: TestConfig) => {
    setTestStates(prev => ({ ...prev, [test.id]: { loading: true } }))

    try {
      let response: unknown

      if (test.endpoint) {
        const res = await fetch(test.endpoint, { method: test.method || 'GET' })
        const text = await res.text()
        try {
          response = JSON.parse(text)
        } catch {
          response = { raw: text.slice(0, 200) }
        }
        if (!res.ok) {
          setTestStates(prev => ({ ...prev, [test.id]: { loading: false, error: response } }))
          return
        }
      } else if (test.onClick) {
        response = await test.onClick(addToast)
      }

      setTestStates(prev => ({ ...prev, [test.id]: { loading: false, result: response } }))
    } catch (err) {
      setTestStates(prev => ({ ...prev, [test.id]: { loading: false, error: String(err) } }))
    }
  }, [addToast])

  return (
    <div style={{ display: 'flex', height: '100dvh', background: '#09090b', color: '#fafafa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Sidebar */}
      <aside
        style={{
          width: '14rem',
          flexShrink: 0,
          borderRight: '1px solid #27272a',
          overflowY: 'auto',
        }}
      >
        <div style={{ padding: '1.25rem 1rem 1rem' }}>
          <h1 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#fafafa', letterSpacing: '-0.01em' }}>
            evlog
          </h1>
          <p style={{ fontSize: '0.6875rem', color: '#71717a', marginTop: '0.125rem' }}>
            Next.js Playground
          </p>
        </div>
        <nav style={{ padding: '0 0.5rem 0.75rem' }}>
          {sections.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                padding: '0.5rem 0.75rem',
                fontSize: '0.8125rem',
                textAlign: 'left',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                transition: 'all 150ms',
                background: activeSection === section.id ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                color: activeSection === section.id ? '#3b82f6' : '#71717a',
                fontWeight: activeSection === section.id ? 500 : 400,
              }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {section.label}
              </span>
              <span style={{ fontSize: '0.625rem', opacity: 0.4, fontVariantNumeric: 'tabular-nums' }}>
                {section.tests.length}
              </span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
            <div style={{ width: '0.25rem', height: '1rem', background: '#3b82f6', borderRadius: '0.125rem' }} />
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#fafafa' }}>
              {currentSection.title}
            </h2>
          </div>
          <p style={{ fontSize: '0.875rem', color: '#71717a', lineHeight: 1.5 }}>
            {currentSection.description}
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gap: '1rem',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          }}
        >
          {currentSection.tests.map(test => (
            <TestCard
              key={test.id}
              test={test}
              loading={testStates[test.id]?.loading ?? false}
              result={testStates[test.id]?.result}
              error={testStates[test.id]?.error}
              onRun={() => runTest(test)}
            />
          ))}
        </div>
      </main>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
