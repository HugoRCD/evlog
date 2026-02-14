<script setup lang="ts">
import { createBrowserLogDrain } from 'evlog/browser'
import { parseError } from 'evlog'

const toast = useToast()
const { sections } = await useTestConfig()

// Handle structured error with toast
async function handleStructuredError() {
  try {
    await $fetch('/api/test/structured-error')
  } catch (err) {
    const error = parseError(err)

    toast.add({
      title: error.message,
      description: error.why,
      color: 'error',
      actions: error.link
        ? [
          {
            label: 'Learn more',
            onClick: () => window.open(error.link, '_blank'),
          },
        ]
        : undefined,
    })

    if (error.fix) {
      console.info(`💡 Fix: ${error.fix}`)
    }
  }
}

// Handle batch request for tail sampling
async function handleBatchRequest() {
  // Make 20 requests in parallel
  await Promise.all(
    Array.from({ length: 20 }, () => $fetch('/api/test/tail-sampling/fast')),
  )
}

async function handlePipelineBatch() {
  await Promise.all(
    Array.from({ length: 10 }, () => $fetch('/api/test/success')),
  )
}

function makeDrainEvent(action: string, extra?: Record<string, unknown>) {
  return {
    event: {
      timestamp: new Date().toISOString(),
      level: 'info' as const,
      service: 'browser',
      environment: 'development',
      action,
      ...extra,
    },
  }
}

async function handleBrowserDrainQuick() {
  const drain = createBrowserLogDrain({
    drain: { endpoint: '/api/test/browser-ingest' },
    pipeline: { batch: { size: 1, intervalMs: 500 } },
    autoFlush: false,
  })
  drain(makeDrainEvent('browser_drain_test'))
  await drain.flush()
}

async function handleBrowserDrainBatch() {
  const drain = createBrowserLogDrain({
    drain: { endpoint: '/api/test/browser-ingest' },
    pipeline: { batch: { size: 10, intervalMs: 500 } },
    autoFlush: false,
  })
  for (let i = 0; i < 5; i++) {
    drain(makeDrainEvent('browser_batch_test', { index: i }))
  }
  await drain.flush()
}

function handleBrowserDrainBeacon() {
  const drain = createBrowserLogDrain({
    drain: { endpoint: '/api/test/browser-ingest' },
    pipeline: { batch: { size: 25, intervalMs: 60000 } },
  })
  for (let i = 0; i < 3; i++) {
    drain(makeDrainEvent('browser_beacon_test', { index: i }))
  }
}

// Get custom onClick for specific tests
function getOnClick(testId: string) {
  if (testId === 'structured-error-toast') {
    return handleStructuredError
  }
  if (testId === 'tail-fast-batch') {
    return handleBatchRequest
  }
  if (testId === 'pipeline-batch') {
    return handlePipelineBatch
  }
  if (testId === 'browser-drain-quick') {
    return handleBrowserDrainQuick
  }
  if (testId === 'browser-drain-batch') {
    return handleBrowserDrainBatch
  }
  if (testId === 'browser-drain-beacon') {
    return handleBrowserDrainBeacon
  }
  return undefined
}
</script>

<template>
  <div class="min-h-dvh bg-default">
    <header class="border-b border-primary/10">
      <div class="max-w-7xl mx-auto px-8 py-6">
        <h1 class="text-3xl font-bold text-highlighted">
          evlog Playground
        </h1>
        <p class="text-muted text-sm mt-1">
          Test logging, wide events, and structured errors
        </p>
      </div>
    </header>

    <div class="max-w-7xl mx-auto px-8 py-10 space-y-16">
      <template v-for="section in sections" :key="section.id">
        <PlaygroundTestSection
          :id="section.id"
          :title="section.title"
          :description="section.description"
        >
          <div class="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <PlaygroundTestCard
              v-for="test in section.tests"
              :key="test.id"
              v-bind="test"
              :on-click="getOnClick(test.id) || test.onClick"
            />
          </div>
        </PlaygroundTestSection>

        <USeparator v-if="section !== sections[sections.length - 1]" />
      </template>
    </div>
  </div>
</template>
