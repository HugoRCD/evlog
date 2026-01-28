<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { Motion } from 'motion-v'

const prefersReducedMotion = ref(false)

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})

const mode = ref<'chaos' | 'clarity'>('chaos')
const isPaused = ref(false)
const chaosScrollRef = ref<HTMLElement | null>(null)
const wideScrollRef = ref<HTMLElement | null>(null)

interface ChaosLog {
  id: number
  text: string
  type: 'info' | 'debug' | 'warn' | 'error'
  timestamp: string
}

interface WideEvent {
  id: number
  type: 'info' | 'warn' | 'error'
  method: string
  path: string
  status: number
  duration: string
  timestamp: string
  data: Record<string, unknown>
}

const chaosLogs = ref<ChaosLog[]>([])
const wideEvents = ref<WideEvent[]>([])
let chaosInterval: ReturnType<typeof setInterval> | null = null
let wideInterval: ReturnType<typeof setInterval> | null = null
let logId = 0
let eventId = 0

const logPool = [
  { text: 'Request started', type: 'info' as const },
  { text: 'Fetching user...', type: 'debug' as const },
  { text: 'User authenticated', type: 'info' as const },
  { text: 'Request started', type: 'info' as const },
  { text: 'Loading cart...', type: 'debug' as const },
  { text: 'Rate limit approaching', type: 'warn' as const },
  { text: 'Payment processed', type: 'info' as const },
  { text: 'Validating token...', type: 'debug' as const },
  { text: 'Cart loaded: 3 items', type: 'info' as const },
  { text: 'Connection timeout', type: 'error' as const },
  { text: 'User authenticated', type: 'info' as const },
  { text: 'Sending email...', type: 'debug' as const },
  { text: 'Request completed', type: 'info' as const },
  { text: 'Order created', type: 'info' as const },
  { text: 'Cache invalidated', type: 'debug' as const },
  { text: 'Card declined', type: 'error' as const },
]

const wideEventPool = [
  {
    type: 'info' as const,
    method: 'POST',
    path: '/api/checkout',
    status: 200,
    duration: '234ms',
    data: { user: { id: 1, plan: 'pro' }, cart: { items: 3, total: 9999 } },
  },
  {
    type: 'error' as const,
    method: 'POST',
    path: '/api/payment',
    status: 402,
    duration: '89ms',
    data: { user: { id: 42 }, error: { why: 'Card declined', fix: 'Try another card' } },
  },
  {
    type: 'warn' as const,
    method: 'GET',
    path: '/api/users',
    status: 200,
    duration: '1.2s',
    data: { warning: 'Slow query detected' },
  },
  {
    type: 'info' as const,
    method: 'GET',
    path: '/api/products',
    status: 200,
    duration: '45ms',
    data: { user: { id: 7 }, count: 150 },
  },
  {
    type: 'info' as const,
    method: 'PUT',
    path: '/api/orders/123',
    status: 200,
    duration: '156ms',
    data: { order: { id: 123, status: 'shipped' } },
  },
  {
    type: 'error' as const,
    method: 'DELETE',
    path: '/api/sessions',
    status: 401,
    duration: '12ms',
    data: { error: { why: 'Token expired', fix: 'Re-authenticate' } },
  },
]

function getTimestamp() {
  return new Date().toISOString().split('T')[1].slice(0, 12)
}

function scrollToBottom(el: HTMLElement | null) {
  if (el) {
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }
}

function addChaosLog() {
  if (isPaused.value) return
  const log = logPool[Math.floor(Math.random() * logPool.length)]
  chaosLogs.value.push({
    id: logId++,
    text: log.text,
    type: log.type,
    timestamp: getTimestamp(),
  })

  nextTick(() => scrollToBottom(chaosScrollRef.value))
}

function addWideEvent() {
  if (isPaused.value) return
  const event = wideEventPool[Math.floor(Math.random() * wideEventPool.length)]
  wideEvents.value.push({
    id: eventId++,
    type: event.type,
    method: event.method,
    path: event.path,
    status: event.status,
    duration: event.duration,
    timestamp: getTimestamp(),
    data: event.data,
  })

  nextTick(() => scrollToBottom(wideScrollRef.value))
}

function togglePause() {
  isPaused.value = !isPaused.value
}

function getTypeClass(type: 'info' | 'debug' | 'warn' | 'error') {
  switch (type) {
    case 'info': return 'text-info'
    case 'debug': return 'text-dimmed'
    case 'warn': return 'text-warning'
    case 'error': return 'text-error'
  }
}

function getStatusClass(status: number) {
  if (status >= 200 && status < 300) return 'text-success'
  if (status >= 400) return 'text-error'
  return 'text-warning'
}

function formatDataEntries(data: Record<string, unknown>) {
  return Object.entries(data).map(([key, value]) => ({
    key,
    value: JSON.stringify(value),
  }))
}

onMounted(() => {
  for (let i = 0; i < 8; i++) {
    const log = logPool[Math.floor(Math.random() * logPool.length)]
    chaosLogs.value.push({
      id: logId++,
      text: log.text,
      type: log.type,
      timestamp: getTimestamp(),
    })
  }
  for (let i = 0; i < 2; i++) {
    const event = wideEventPool[Math.floor(Math.random() * wideEventPool.length)]
    wideEvents.value.push({
      id: eventId++,
      type: event.type,
      method: event.method,
      path: event.path,
      status: event.status,
      duration: event.duration,
      timestamp: getTimestamp(),
      data: event.data,
    })
  }

  chaosInterval = setInterval(addChaosLog, 600)
  wideInterval = setInterval(addWideEvent, 1800)
})

onUnmounted(() => {
  if (chaosInterval) clearInterval(chaosInterval)
  if (wideInterval) clearInterval(wideInterval)
})
</script>

<template>
  <section id="problem" class="relative py-32">
    <div class="mx-auto max-w-4xl px-6">
      <Motion
        :initial="prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }"
        :in-view="{ opacity: 1, y: 0 }"
        :transition="{ duration: prefersReducedMotion ? 0 : 0.5 }"
        :in-view-options="{ once: true }"
        class="mb-12 text-center"
      >
        <h2 class="editorial-title mb-6 text-4xl font-bold text-highlighted md:text-5xl">
          The problem<span class="evlog-dot">.</span>
        </h2>
        <p class="mx-auto max-w-2xl text-lg text-muted">
          Multiple requests hit your server simultaneously. Logs arrive mixed together.
          Which log belongs to which request? Good luck.
        </p>
      </Motion>

      <div class="dark overflow-hidden rounded-lg border border-muted bg-[#09090b]">
        <div class="flex border-b border-muted">
          <button
            class="flex-1 px-4 py-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-evlog-blue focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-900"
            :class="mode === 'chaos'
              ? 'bg-accented text-highlighted'
              : 'text-muted hover:text-toned'"
            @click="mode = 'chaos'"
          >
            Traditional Logging
          </button>
          <button
            class="flex-1 border-l border-muted px-4 py-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-evlog-blue focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-900"
            :class="mode === 'clarity'
              ? 'bg-accented text-highlighted'
              : 'text-muted hover:text-toned'"
            @click="mode = 'clarity'"
          >
            Wide Events
          </button>
          <button
            class="border-l border-muted px-3 py-2.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-evlog-blue focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-900"
            :class="isPaused ? 'text-success' : 'text-muted hover:text-toned'"
            :aria-label="isPaused ? 'Resume animation' : 'Pause animation'"
            @click="togglePause"
          >
            <span v-if="isPaused" aria-hidden="true">▶</span>
            <span v-else aria-hidden="true">⏸</span>
          </button>
        </div>

        <div class="h-[380px]">
          <div v-show="mode === 'chaos'" class="flex h-full flex-col">
            <div
              ref="chaosScrollRef"
              class="terminal-scroll flex-1 overflow-y-auto px-4 py-3 font-mono text-xs leading-relaxed"
            >
              <div class="space-y-0.5">
                <div
                  v-for="log in chaosLogs"
                  :key="log.id"
                  class="flex items-baseline gap-3 py-0.5"
                >
                  <span class="shrink-0 tabular-nums text-dimmed">
                    {{ log.timestamp }}
                  </span>
                  <span :class="getTypeClass(log.type)" class="w-10 shrink-0 text-right uppercase">
                    {{ log.type }}
                  </span>
                  <span class="text-toned">
                    {{ log.text }}
                  </span>
                </div>
              </div>
            </div>

            <div class="border-t border-muted px-4 py-3">
              <div class="flex justify-center gap-8 text-xs">
                <span class="flex items-center gap-1.5 text-muted">
                  <span class="text-error">✗</span> Which request failed?
                </span>
                <span class="flex items-center gap-1.5 text-muted">
                  <span class="text-error">✗</span> Who was the user?
                </span>
                <span class="flex items-center gap-1.5 text-muted">
                  <span class="text-error">✗</span> What was in their cart?
                </span>
              </div>
            </div>
          </div>

          <div v-show="mode === 'clarity'" class="flex h-full flex-col">
            <div
              ref="wideScrollRef"
              class="terminal-scroll flex-1 overflow-y-auto px-4 py-3 font-mono text-xs leading-relaxed"
            >
              <div class="space-y-3">
                <div
                  v-for="event in wideEvents"
                  :key="event.id"
                  class="border-l-2 py-2 pl-3"
                  :class="{
                    'border-success/50': event.type === 'info',
                    'border-error/50': event.type === 'error',
                    'border-warning/50': event.type === 'warn',
                  }"
                >
                  <div class="flex items-baseline gap-3">
                    <span class="shrink-0 tabular-nums text-dimmed">
                      {{ event.timestamp }}
                    </span>
                    <span :class="getTypeClass(event.type)" class="w-10 shrink-0 text-right uppercase">
                      {{ event.type }}
                    </span>
                    <span class="text-toned">
                      {{ event.method }} {{ event.path }}
                    </span>
                    <span class="ml-auto flex items-center gap-2">
                      <span :class="getStatusClass(event.status)">{{ event.status }}</span>
                      <span class="text-dimmed">({{ event.duration }})</span>
                    </span>
                  </div>
                  <div class="mt-1 space-y-0.5 pl-[104px]">
                    <div v-for="entry in formatDataEntries(event.data)" :key="entry.key">
                      <span class="text-evlog-blue">{{ entry.key }}:</span>
                      <span class="text-muted"> {{ entry.value }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="border-t border-muted px-4 py-3">
              <div class="flex justify-center gap-8 text-xs">
                <span class="flex items-center gap-1.5 text-muted">
                  <span class="text-success">✓</span> Each request is isolated
                </span>
                <span class="flex items-center gap-1.5 text-muted">
                  <span class="text-success">✓</span> Full context at a glance
                </span>
                <span class="flex items-center gap-1.5 text-muted">
                  <span class="text-success">✓</span> Errors explain why & how to fix
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.terminal-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgb(63 63 70 / 0.5) transparent;
}

.terminal-scroll::-webkit-scrollbar {
  width: 6px;
}

.terminal-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.terminal-scroll::-webkit-scrollbar-thumb {
  background: rgb(63 63 70 / 0.5);
  border-radius: 3px;
}

.terminal-scroll::-webkit-scrollbar-thumb:hover {
  background: rgb(63 63 70 / 0.7);
}
</style>
