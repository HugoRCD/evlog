<script setup lang="ts">
import { createError, parseError } from 'evlog'

const toast = useToast()

const loadingSuccess = ref(false)
const loadingError = ref(false)
const loadingWideEvent = ref(false)
const loadingStructuredError = ref(false)

// Tail sampling tests
const loadingFastSingle = ref(false)
const loadingFastBatch = ref(false)
const loadingSlow = ref(false)
const loadingTailError = ref(false)
const loadingCritical = ref(false)
const loadingPremium = ref(false)

function testClientLog() {
  log.info({ action: 'test_client', timestamp: Date.now() })
}

function testClientWarn() {
  log.warn('validation', 'Form field is empty')
}

function testClientError() {
  log.error('validation', 'Form field is empty')
}

function testStructuredError() {
  const error = createError({
    message: 'Test structured error',
    status: 400,
    why: 'This is a demonstration of the EvlogError format',
    fix: 'No fix needed - this is just a demo',
    link: 'https://github.com/hugorcd/evlog',
  })
  console.error(String(error))
}

async function testApiSuccess() {
  loadingSuccess.value = true
  try {
    await $fetch('/api/test/success')
  } finally {
    loadingSuccess.value = false
  }
}

async function testApiError() {
  loadingError.value = true
  try {
    await $fetch('/api/test/error')
  } catch {
    // Do nothing
  } finally {
    loadingError.value = false
  }
}

async function testWideEvent() {
  loadingWideEvent.value = true
  try {
    await $fetch('/api/test/wide-event')
  } finally {
    loadingWideEvent.value = false
  }
}

async function testStructuredApiError() {
  loadingStructuredError.value = true
  try {
    await $fetch('/api/test/structured-error')
  } catch (err) {
    // parseError extracts all evlog fields at the top level
    const error = parseError(err)

    toast.add({
      title: error.message,
      description: error.why,
      color: 'error',
      actions: error.link
        ? [
          {
            label: 'Learn more',
            onClick: () => {
              window.open(error.link, '_blank')
            },
          },
        ]
        : undefined,
    })

    // Direct access to fix
    if (error.fix) {
      console.info(`💡 Fix: ${error.fix}`)
    }
  } finally {
    loadingStructuredError.value = false
  }
}

// Tail sampling test functions
async function testFastRequest() {
  loadingFastSingle.value = true
  try {
    await $fetch('/api/test/tail-sampling/fast')
  } finally {
    loadingFastSingle.value = false
  }
}

async function testFastRequestBatch() {
  loadingFastBatch.value = true
  try {
    // Make 20 requests in parallel
    await Promise.all(
      Array.from({ length: 20 }, () => $fetch('/api/test/tail-sampling/fast')),
    )
    toast.add({
      title: '20 fast requests sent',
      description: 'Check terminal - only ~10% should be logged (head sampling)',
      color: 'info',
    })
  } finally {
    loadingFastBatch.value = false
  }
}

async function testSlowRequest() {
  loadingSlow.value = true
  try {
    await $fetch('/api/test/tail-sampling/slow')
    toast.add({
      title: 'Slow request completed',
      description: 'This should always be logged (duration >= 500ms)',
      color: 'success',
    })
  } finally {
    loadingSlow.value = false
  }
}

async function testTailError() {
  loadingTailError.value = true
  try {
    await $fetch('/api/test/tail-sampling/error')
  } catch {
    toast.add({
      title: 'Error request triggered',
      description: 'This should always be logged (status >= 400)',
      color: 'error',
    })
  } finally {
    loadingTailError.value = false
  }
}

async function testCriticalPath() {
  loadingCritical.value = true
  try {
    await $fetch('/api/test/critical/important')
    toast.add({
      title: 'Critical path request',
      description: 'This should always be logged (path matches /api/test/critical/**)',
      color: 'warning',
    })
  } finally {
    loadingCritical.value = false
  }
}

async function testPremiumUser() {
  loadingPremium.value = true
  try {
    await $fetch('/api/test/tail-sampling/premium')
    toast.add({
      title: 'Premium user request',
      description: 'This should always be logged (evlog:emit:keep hook)',
      color: 'success',
    })
  } finally {
    loadingPremium.value = false
  }
}
</script>

<template>
  <div class="min-h-dvh bg-default p-8">
    <div class="max-w-4xl mx-auto space-y-8">
      <header>
        <h1 class="text-3xl font-bold text-highlighted">
          evlog Playground
        </h1>
        <p class="text-muted mt-2">
          Test wide events, structured errors, and logging. Check the browser console and terminal for output.
        </p>
      </header>

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-highlighted">
          Client-side Logging
        </h2>
        <p class="text-muted text-sm">
          These logs appear in the browser console with pretty formatting.
        </p>
        <div class="flex flex-wrap gap-3">
          <UButton
            label="log.info()"
            @click="testClientLog"
          />
          <UButton
            label="log.warn()"
            color="warning"
            @click="testClientWarn"
          />
          <UButton
            label="log.error()"
            color="error"
            @click="testClientError"
          />
          <UButton
            label="createError()"
            color="error"
            @click="testStructuredError"
          />
        </div>
      </section>

      <USeparator />

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-highlighted">
          Server-side Wide Events
        </h2>
        <p class="text-muted text-sm">
          These calls trigger API endpoints that use <code class="text-highlighted">useLogger(event)</code> to build wide events.
          Check the terminal for structured output.
        </p>
        <div class="flex flex-wrap gap-3">
          <UButton
            label="Test Success"
            :loading="loadingSuccess"
            @click="testApiSuccess"
          />
          <UButton
            label="Test Error"
            :loading="loadingError"
            color="error"
            @click="testApiError"
          />
          <UButton
            label="Test Wide Event"
            :loading="loadingWideEvent"
            color="neutral"
            @click="testWideEvent"
          />
        </div>
      </section>

      <USeparator />

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-highlighted">
          Structured Error → Toast
        </h2>
        <p class="text-muted text-sm">
          This demonstrates how a structured <code class="text-highlighted">createError()</code> from the backend
          can be displayed as a toast in the frontend with all context (message, why, fix, link).
        </p>
        <div class="flex flex-wrap gap-3">
          <UButton
            label="Trigger API Error"
            :loading="loadingStructuredError"
            color="error"
            @click="testStructuredApiError"
          />
        </div>
      </section>

      <USeparator />

      <section class="space-y-4">
        <h2 class="text-xl font-semibold text-highlighted">
          Tail Sampling
        </h2>
        <p class="text-muted text-sm">
          Test how tail sampling rescues logs that would be dropped by head sampling.
          Config: <code class="text-highlighted">rates: { info: 10 }</code> (only 10% logged by default).
        </p>

        <div class="grid gap-4 md:grid-cols-2">
          <div class="p-4 rounded-lg bg-elevated space-y-3">
            <h3 class="font-medium text-highlighted">
              Head Sampling Only (10%)
            </h3>
            <p class="text-sm text-muted">
              Fast requests - only ~10% will appear in logs.
            </p>
            <div class="flex gap-2">
              <UButton
                label="1 Request"
                :loading="loadingFastSingle"
                variant="outline"
                @click="testFastRequest"
              />
              <UButton
                label="20 Requests"
                :loading="loadingFastBatch"
                @click="testFastRequestBatch"
              />
            </div>
          </div>

          <div class="p-4 rounded-lg bg-elevated space-y-3">
            <h3 class="font-medium text-highlighted">
              Tail: Duration >= 500ms
            </h3>
            <p class="text-sm text-muted">
              Slow requests (600ms) - always logged.
            </p>
            <UButton
              label="Slow Request"
              :loading="loadingSlow"
              color="warning"
              @click="testSlowRequest"
            />
          </div>

          <div class="p-4 rounded-lg bg-elevated space-y-3">
            <h3 class="font-medium text-highlighted">
              Tail: Status >= 400
            </h3>
            <p class="text-sm text-muted">
              Error responses - always logged.
            </p>
            <UButton
              label="Error Request"
              :loading="loadingTailError"
              color="error"
              @click="testTailError"
            />
          </div>

          <div class="p-4 rounded-lg bg-elevated space-y-3">
            <h3 class="font-medium text-highlighted">
              Tail: Path Pattern
            </h3>
            <p class="text-sm text-muted">
              Critical paths (<code class="text-xs">/api/test/critical/**</code>) - always logged.
            </p>
            <UButton
              label="Critical Path"
              :loading="loadingCritical"
              color="warning"
              @click="testCriticalPath"
            />
          </div>

          <div class="p-4 rounded-lg bg-elevated space-y-3 md:col-span-2">
            <h3 class="font-medium text-highlighted">
              Tail: Custom Hook (evlog:emit:keep)
            </h3>
            <p class="text-sm text-muted">
              Premium users - always logged via custom Nitro hook.
            </p>
            <UButton
              label="Premium User Request"
              :loading="loadingPremium"
              color="success"
              @click="testPremiumUser"
            />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
