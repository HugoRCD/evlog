import { createError } from 'evlog'

export interface TestConfig {
  id: string
  label: string
  endpoint?: string
  method?: 'GET' | 'POST'
  onClick?: () => void | Promise<void>
  color?: string
  variant?: string
  description?: string
  badge?: {
    label: string
    color: string
  }
  showResult?: boolean
  toastOnSuccess?: {
    title: string
    description: string
  }
  toastOnError?: {
    title: string
    description: string
  }
}

export interface TestSection {
  id: string
  label: string
  icon?: string
  title: string
  description: string
  tests: TestConfig[]
  layout?: 'buttons' | 'cards' | 'grid'
  gridCols?: number
}

export const testConfig = {
  sections: [
    {
      id: 'client-logging',
      label: 'Client Logging',
      icon: 'i-lucide-laptop',
      title: 'Client-side Logging',
      description: 'These logs appear in the browser console with pretty formatting.',
      layout: 'cards',
      tests: [
        {
          id: 'client-info',
          label: 'log.info()',
          description: 'Log informational messages to the browser console with structured data',
          onClick: () => log.info({ action: 'test_client', timestamp: Date.now() }),
          badge: {
            label: 'Info',
            color: 'blue',
          },
        },
        {
          id: 'client-warn',
          label: 'log.warn()',
          description: 'Log warning messages for non-critical issues',
          color: 'warning',
          onClick: () => log.warn('validation', 'Form field is empty'),
          badge: {
            label: 'Warning',
            color: 'warning',
          },
        },
        {
          id: 'client-error',
          label: 'log.error()',
          description: 'Log error messages for caught exceptions',
          color: 'error',
          onClick: () => log.error('validation', 'Form field is empty'),
          badge: {
            label: 'Error',
            color: 'error',
          },
        },
        {
          id: 'client-create-error',
          label: 'createError()',
          description: 'Create structured errors with context (message, why, fix, link)',
          color: 'error',
          onClick: () => {
            const error = createError({
              message: 'Test structured error',
              status: 400,
              why: 'This is a demonstration of the EvlogError format',
              fix: 'No fix needed - this is just a demo',
              link: 'https://github.com/hugorcd/evlog',
            })
            console.error(String(error))
          },
          badge: {
            label: 'Structured',
            color: 'red',
          },
        },
      ],
    } as TestSection,
    {
      id: 'identity',
      label: 'Identity',
      icon: 'i-lucide-user',
      title: 'Client Identity',
      description: 'Attach user identity to all client logs via setIdentity(). Identity fields are included in every log and transported to the server. PostHog auto-maps userId → distinct_id.',
      layout: 'cards',
      tests: [
        {
          id: 'identity-set',
          label: 'setIdentity()',
          description: 'Sets userId and orgId on all future client logs. Open the console and check the transport payload.',
          color: 'primary',
          badge: {
            label: 'setIdentity',
            color: 'blue',
          },
        },
        {
          id: 'identity-log',
          label: 'log.info() with identity',
          description: 'Emits a log — identity fields (userId, orgId) are automatically included.',
          badge: {
            label: 'Auto-enriched',
            color: 'green',
          },
        },
        {
          id: 'identity-override',
          label: 'Override userId',
          description: 'Per-event fields take priority over identity. This log overrides userId.',
          color: 'warning',
          badge: {
            label: 'Event > Identity',
            color: 'warning',
          },
        },
        {
          id: 'identity-clear',
          label: 'clearIdentity()',
          description: 'Clears identity context. Future logs will no longer include userId/orgId.',
          color: 'error',
          badge: {
            label: 'clearIdentity',
            color: 'red',
          },
        },
      ],
    } as TestSection,
    {
      id: 'wide-events',
      label: 'Wide Events',
      icon: 'i-lucide-server',
      title: 'Server-side Wide Events',
      description: 'These calls trigger API endpoints that use useLogger(event) to build wide events. Check the terminal for structured output.',
      layout: 'cards',
      tests: [
        {
          id: 'api-success',
          label: 'Test Success',
          description: 'Successful API request with wide event logging',
          endpoint: '/api/test/success',
          method: 'GET',
          color: 'success',
          badge: {
            label: 'GET /api/test/success',
            color: 'green',
          },
        },
        {
          id: 'api-error',
          label: 'Test Error',
          description: 'API error response with automatic error logging',
          endpoint: '/api/test/error',
          method: 'GET',
          color: 'error',
          badge: {
            label: 'GET /api/test/error',
            color: 'red',
          },
        },
        {
          id: 'api-wide-event',
          label: 'Test Wide Event',
          description: 'Complete wide event with custom fields and metadata',
          endpoint: '/api/test/wide-event',
          method: 'GET',
          color: 'primary',
          badge: {
            label: 'Wide Event',
            color: 'blue',
          },
        },
      ],
    } as TestSection,
    {
      id: 'structured-errors',
      label: 'Structured Errors',
      icon: 'i-lucide-shield-alert',
      title: 'Structured Error → Toast',
      description: 'This demonstrates how a structured createError() from the backend can be displayed as a toast in the frontend with all context (message, why, fix, link).',
      layout: 'cards',
      tests: [
        {
          id: 'structured-error-toast',
          label: 'Trigger API Error',
          description: 'Server-side structured error automatically displayed as a rich toast with context, suggested fix, and helpful links',
          color: 'error',
          badge: {
            label: 'parseError()',
            color: 'red',
          },
        },
      ],
    } as TestSection,
    {
      id: 'tail-sampling',
      label: 'Tail Sampling',
      icon: 'i-lucide-filter',
      title: 'Tail Sampling',
      description: 'Test how tail sampling rescues logs that would be dropped by head sampling. Config: rates: { info: 10 } (only 10% logged by default).',
      layout: 'cards',
      tests: [
        {
          id: 'tail-fast-single',
          label: '1 Request',
          description: 'Fast requests - only ~10% will appear in logs.',
          endpoint: '/api/test/tail-sampling/fast',
          method: 'GET',
          color: 'neutral',
          badge: {
            label: 'Head Sampling Only (10%)',
            color: 'gray',
          },
        },
        {
          id: 'tail-fast-batch',
          label: '20 Requests',
          description: 'Fast requests - only ~10% will appear in logs.',
          color: 'neutral',
          badge: {
            label: 'Head Sampling Only (10%)',
            color: 'gray',
          },
          toastOnSuccess: {
            title: '20 fast requests sent',
            description: 'Check terminal - only ~10% should be logged (head sampling)',
          },
        },
        {
          id: 'tail-slow',
          label: 'Slow Request',
          description: 'Slow requests (600ms) - always logged.',
          endpoint: '/api/test/tail-sampling/slow',
          method: 'GET',
          color: 'warning',
          badge: {
            label: 'Tail: Duration >= 500ms',
            color: 'warning',
          },
          toastOnSuccess: {
            title: 'Slow request completed',
            description: 'This should always be logged (duration >= 500ms)',
          },
        },
        {
          id: 'tail-error',
          label: 'Error Request',
          description: 'Error responses - always logged.',
          endpoint: '/api/test/tail-sampling/error',
          method: 'GET',
          color: 'error',
          badge: {
            label: 'Tail: Status >= 400',
            color: 'error',
          },
          toastOnError: {
            title: 'Error request triggered',
            description: 'This should always be logged (status >= 400)',
          },
        },
        {
          id: 'tail-critical',
          label: 'Critical Path',
          description: 'Critical paths (/api/test/critical/**) - always logged.',
          endpoint: '/api/test/critical/important',
          method: 'GET',
          color: 'warning',
          badge: {
            label: 'Tail: Path Pattern',
            color: 'warning',
          },
          toastOnSuccess: {
            title: 'Critical path request',
            description: 'This should always be logged (path matches /api/test/critical/**)',
          },
        },
        {
          id: 'tail-premium',
          label: 'Premium User Request',
          description: 'Premium users - always logged via custom Nitro hook.',
          endpoint: '/api/test/tail-sampling/premium',
          method: 'GET',
          color: 'success',
          badge: {
            label: 'Tail: Custom Hook',
            color: 'success',
          },
          toastOnSuccess: {
            title: 'Premium user request',
            description: 'This should always be logged (evlog:emit:keep hook)',
          },
        },
      ],
    } as TestSection,
    {
      id: 'pipeline',
      label: 'Pipeline',
      icon: 'i-lucide-layers',
      title: 'Drain Pipeline (Batching + Retry)',
      description: 'Events are buffered and sent in batches (size: 5, interval: 2s). Watch the terminal for batched drain output.',
      layout: 'cards',
      tests: [
        {
          id: 'pipeline-single',
          label: '1 Request',
          description: 'Single event - buffered until batch size (5) or interval (2s) is reached',
          endpoint: '/api/test/success',
          method: 'GET',
          badge: {
            label: 'Buffered',
            color: 'blue',
          },
          toastOnSuccess: {
            title: 'Event buffered',
            description: 'Check terminal - will flush after 2s or when 5 events accumulate',
          },
        },
        {
          id: 'pipeline-batch',
          label: 'Fire 10 Requests',
          description: 'Fires 10 requests in parallel - should produce 2 batches of 5 events',
          badge: {
            label: '2 batches',
            color: 'green',
          },
          toastOnSuccess: {
            title: '10 requests sent',
            description: 'Check terminal - should see 2 batches of 5 events',
          },
        },
      ],
    } as TestSection,
    {
      id: 'browser-drain',
      label: 'Browser Drain',
      icon: 'i-lucide-globe',
      title: 'Browser Drain',
      description: 'Send browser logs to your server via fetch/sendBeacon. Events are batched and flushed automatically. Check the terminal for [BROWSER DRAIN] output.',
      layout: 'cards',
      tests: [
        {
          id: 'browser-drain-quick',
          label: 'Quick Setup',
          description: 'Creates a browser drain, pushes a single event via initLogger + log.info, and flushes immediately.',
          color: 'primary',
          badge: {
            label: 'fetch POST',
            color: 'blue',
          },
          toastOnSuccess: {
            title: 'Browser drain event sent',
            description: 'Check terminal for [BROWSER DRAIN] output',
          },
        },
        {
          id: 'browser-drain-batch',
          label: 'Batch 5 Events',
          description: 'Creates the drain, pushes 5 events, and flushes. Demonstrates batching.',
          color: 'success',
          badge: {
            label: '5 events batched',
            color: 'green',
          },
          toastOnSuccess: {
            title: '5 events batched and sent',
            description: 'Check terminal for [BROWSER DRAIN] output',
          },
        },
        {
          id: 'browser-drain-beacon',
          label: 'Auto-flush (Page Hidden)',
          description: 'Pushes events with autoFlush enabled (default). Switch tabs or navigate away — the visibilitychange listener flushes via sendBeacon automatically.',
          color: 'warning',
          badge: {
            label: 'sendBeacon',
            color: 'warning',
          },
          toastOnSuccess: {
            title: 'Events buffered',
            description: 'Navigate away or switch tabs — events will flush via sendBeacon',
          },
        },
      ],
    } as TestSection,
    {
      id: 'drains',
      label: 'Drains',
      icon: 'i-lucide-database',
      title: 'Log Drains',
      description: 'Test the drain adapters (Axiom, OTLP, PostHog). Events flow through the evlog:drain hook in server/plugins/evlog-drain.ts. Uncomment an adapter there to test it live.',
      layout: 'cards',
      tests: [
        {
          id: 'drain-test',
          label: 'Emit Drain Event',
          description: 'Triggers a wide event that flows through the evlog:drain hook. Check terminal output and any configured adapters.',
          endpoint: '/api/test/drain',
          method: 'GET',
          color: 'primary',
          showResult: true,
          badge: {
            label: 'evlog:drain',
            color: 'blue',
          },
        },
      ],
    } as TestSection,
    {
      id: 'services',
      label: 'Services',
      icon: 'i-lucide-network',
      title: 'Service Testing',
      description: 'Test different service configurations and watch the logs in your terminal. Look for [auth-service], [payment-service], etc.',
      layout: 'cards',
      tests: [
        {
          id: 'service-auth',
          label: 'Test POST /api/auth/login',
          description: 'Tests the auth-service configuration via route matching',
          endpoint: '/api/auth/login',
          method: 'POST',
          color: 'primary',
          showResult: true,
          badge: {
            label: '/api/auth/**',
            color: 'purple',
          },
        },
        {
          id: 'service-payment',
          label: 'Test POST /api/payment/process',
          description: 'Tests the payment-service configuration via route matching',
          endpoint: '/api/payment/process',
          method: 'POST',
          color: 'success',
          showResult: true,
          badge: {
            label: '/api/payment/**',
            color: 'green',
          },
        },
        {
          id: 'service-booking',
          label: 'Test POST /api/booking/create',
          description: 'Tests the booking-service configuration via route matching',
          endpoint: '/api/booking/create',
          method: 'POST',
          color: 'warning',
          showResult: true,
          badge: {
            label: '/api/booking/**',
            color: 'orange',
          },
        },
        {
          id: 'service-custom',
          label: 'Test GET /api/test/service-override',
          description: 'Tests explicit service override via useLogger parameter',
          endpoint: '/api/test/service-override',
          method: 'GET',
          color: 'primary',
          showResult: true,
          badge: {
            label: 'useLogger(event, \'...\')',
            color: 'sky',
          },
        },
        {
          id: 'service-default',
          label: 'Test GET /api/test/success',
          description: 'Tests the default service for unmatched routes',
          endpoint: '/api/test/success',
          method: 'GET',
          color: 'neutral',
          showResult: true,
          badge: {
            label: 'env.service fallback',
            color: 'gray',
          },
        },
      ],
    } as TestSection,
  ],
}
