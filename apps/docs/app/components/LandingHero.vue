<script setup lang="ts">
import { Motion } from 'motion-v'

const prefersReducedMotion = ref(false)
const mode = ref<'chaos' | 'wide'>('chaos')
const isPaused = ref(false)
const copied = ref(false)

async function copyCommand() {
  await navigator.clipboard.writeText('npx skills add hugorcd/evlog')
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 2000)
}

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})

interface LogEntry {
  id: number
  timestamp: string
  level: 'info' | 'debug' | 'warn' | 'error'
  text: string
}

interface WideEvent {
  id: number
  timestamp: string
  level: 'info' | 'warn' | 'error'
  method: string
  path: string
  status: number
  duration: string
  context: { key: string, value: string }[]
}

const chaosLogs = ref<LogEntry[]>([])
const wideEvents = ref<WideEvent[]>([])
let logId = 0
let eventId = 0

const logTemplates = [
  { text: 'Starting request handler', level: 'info' as const },
  { text: 'Authenticating user token', level: 'debug' as const },
  { text: 'User session validated', level: 'info' as const },
  { text: 'Loading user preferences', level: 'debug' as const },
  { text: 'Fetching cart from database', level: 'debug' as const },
  { text: 'Rate limit threshold: 80%', level: 'warn' as const },
  { text: 'Processing payment intent', level: 'info' as const },
  { text: 'Stripe API call initiated', level: 'debug' as const },
  { text: 'Card validation passed', level: 'info' as const },
  { text: 'Connection timeout to DB', level: 'error' as const },
  { text: 'Order created successfully', level: 'info' as const },
  { text: 'Sending confirmation email', level: 'debug' as const },
]

const wideEventTemplates = [
  {
    level: 'info' as const,
    method: 'POST',
    path: '/api/checkout',
    status: 200,
    duration: '234ms',
    context: [
      { key: 'user', value: '{ id: 1842, plan: "pro" }' },
      { key: 'cart', value: '{ items: 3, total: 9999 }' },
    ],
  },
  {
    level: 'error' as const,
    method: 'POST',
    path: '/api/payment',
    status: 402,
    duration: '89ms',
    context: [
      { key: 'user', value: '{ id: 42 }' },
      { key: 'error.why', value: '"Card declined by issuer"' },
      { key: 'error.fix', value: '"Try another card"' },
    ],
  },
  {
    level: 'info' as const,
    method: 'GET',
    path: '/api/products',
    status: 200,
    duration: '45ms',
    context: [
      { key: 'user', value: '{ id: 7, role: "admin" }' },
      { key: 'result', value: '{ count: 150 }' },
    ],
  },
]

function getTimestamp() {
  return new Date().toISOString().split('T')[1]?.slice(0, 12) ?? ''
}

function addChaosLog() {
  if (isPaused.value) return
  const template = logTemplates[Math.floor(Math.random() * logTemplates.length)]
  if (!template) return
  chaosLogs.value.push({
    id: logId++,
    timestamp: getTimestamp(),
    level: template.level,
    text: template.text,
  })
  if (chaosLogs.value.length > 10) chaosLogs.value.shift()
}

function addWideEvent() {
  if (isPaused.value) return
  const template = wideEventTemplates[Math.floor(Math.random() * wideEventTemplates.length)]
  if (!template) return
  wideEvents.value.push({
    id: eventId++,
    timestamp: getTimestamp(),
    level: template.level,
    method: template.method,
    path: template.path,
    status: template.status,
    duration: template.duration,
    context: template.context,
  })
  if (wideEvents.value.length > 3) wideEvents.value.shift()
}

let chaosInterval: ReturnType<typeof setInterval> | null = null
let wideInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  for (let i = 0; i < 6; i++) addChaosLog()
  for (let i = 0; i < 2; i++) addWideEvent()
  chaosInterval = setInterval(addChaosLog, 600)
  wideInterval = setInterval(addWideEvent, 2200)
})

onUnmounted(() => {
  if (chaosInterval) clearInterval(chaosInterval)
  if (wideInterval) clearInterval(wideInterval)
})

function getLevelColor(level: string) {
  return {
    info: 'text-emerald-500',
    debug: 'text-zinc-500',
    warn: 'text-amber-500',
    error: 'text-red-500',
  }[level] || 'text-zinc-500'
}
</script>

<template>
  <UPageSection class="relative bg-default dot-grid overflow-hidden">
    <div class="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5 }"
      >
        <button
          class="group mb-2 flex items-center gap-2 font-pixel text-sm transition-colors cursor-copy"
          :class="copied ? 'text-emerald-500' : 'text-muted hover:text-highlighted'"
          @click="copyCommand"
        >
          <span v-if="copied">Copied!</span>
          <span v-else>$ npx skills add hugorcd/evlog</span>
        </button>

        <h1 class="font-pixel mb-6 text-5xl sm:text-6xl lg:text-7xl">
          Logging that<br>makes sense<span class="text-primary">.</span>
        </h1>

        <p class="mb-8 max-w-md text-base text-muted leading-relaxed">
          Wide events and structured errors for TypeScript.
          One log per request. Full context. Errors that explain why.
        </p>

        <div class="flex flex-wrap items-center gap-4">
          <UButton
            to="/getting-started/installation"
            size="lg"
            class="bg-primary hover:bg-primary/90 text-white border-0"
            trailing-icon="i-lucide-arrow-right"
            label="Get Started"
          />
          <UButton
            to="https://github.com/hugorcd/evlog"
            target="_blank"
            size="lg"
            variant="outline"
            color="neutral"
            label="GitHub"
            leading-icon="i-simple-icons-github"
          />
        </div>
      </Motion>

      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5, delay: 0.15 }"
      >
        <div class="dark overflow-hidden border border-zinc-800 bg-[#0c0c0e]">
          <div class="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <div class="flex gap-1.5">
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
            </div>
            <div class="flex-1" />
            <button
              class="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              @click="isPaused = !isPaused"
            >
              {{ isPaused ? '▶' : '⏸' }}
            </button>
          </div>

          <div class="flex border-b border-zinc-800">
            <button
              class="px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px"
              :class="mode === 'chaos'
                ? 'text-white border-primary'
                : 'text-zinc-500 border-transparent hover:text-zinc-300'"
              @click="mode = 'chaos'"
            >
              Traditional Logs
            </button>
            <button
              class="px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px"
              :class="mode === 'wide'
                ? 'text-white border-primary'
                : 'text-zinc-500 border-transparent hover:text-zinc-300'"
              @click="mode = 'wide'"
            >
              Wide Events
            </button>
          </div>

          <div class="h-[300px] overflow-hidden">
            <div v-show="mode === 'chaos'" class="h-full flex flex-col">
              <div class="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed">
                <div v-for="log in chaosLogs" :key="log.id" class="flex gap-3 py-0.5">
                  <span class="shrink-0 tabular-nums text-zinc-600">{{ log.timestamp }}</span>
                  <span :class="getLevelColor(log.level)" class="w-10 shrink-0 uppercase font-medium">
                    {{ log.level }}
                  </span>
                  <span class="text-zinc-300">{{ log.text }}</span>
                </div>
              </div>
              <div class="border-t border-zinc-800 px-4 py-3 flex flex-wrap justify-center gap-6 text-xs text-zinc-500">
                <span><span class="text-red-500 mr-1.5">✗</span>Which request failed?</span>
                <span><span class="text-red-500 mr-1.5">✗</span>Who was the user?</span>
              </div>
            </div>

            <div v-show="mode === 'wide'" class="h-full flex flex-col">
              <div class="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed">
                <div v-for="event in wideEvents" :key="event.id" class="mb-3 last:mb-0">
                  <div class="flex items-baseline gap-3">
                    <span class="shrink-0 tabular-nums text-zinc-600">{{ event.timestamp }}</span>
                    <span :class="getLevelColor(event.level)" class="w-10 shrink-0 uppercase font-medium">
                      {{ event.level }}
                    </span>
                    <span class="text-violet-400">{{ event.method }}</span>
                    <span class="text-amber-400">{{ event.path }}</span>
                    <span class="ml-auto flex items-center gap-2">
                      <span :class="event.status >= 400 ? 'text-red-500' : 'text-emerald-500'">
                        {{ event.status }}
                      </span>
                      <span class="text-zinc-600">({{ event.duration }})</span>
                    </span>
                  </div>
                  <div class="mt-1 pl-[88px] space-y-0.5">
                    <div v-for="ctx in event.context" :key="ctx.key">
                      <span class="text-sky-400">{{ ctx.key }}</span><span class="text-zinc-600">:</span>
                      <span class="text-zinc-500"> {{ ctx.value }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div class="border-t border-zinc-800 px-4 py-3 flex flex-wrap justify-center gap-6 text-xs text-zinc-500">
                <span><span class="text-emerald-500 mr-1.5">✓</span>One log per request</span>
                <span><span class="text-emerald-500 mr-1.5">✓</span>Full context</span>
              </div>
            </div>
          </div>
        </div>
      </Motion>
    </div>
  </UPageSection>
</template>
