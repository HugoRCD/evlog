<script setup lang="ts">
const phase = ref<'chaos' | 'resolving' | 'resolved'>('chaos')
const chaosLogs = ref<{ id: number, ts: string, level: string, msg: string, line: number }[]>([])
const visibleFields = ref(0)
const ctaVisible = ref(false)

let logId = 0
let lineNum = 1
let chaosInterval: ReturnType<typeof setInterval> | null = null
let fieldInterval: ReturnType<typeof setInterval> | null = null

const logTemplates = [
  { msg: 'GET /api/users/me 200 (8ms)', level: 'info' },
  { msg: 'Flag "new-pricing-engine" → enabled', level: 'debug' },
  { msg: 'POST /api/cart 200 (31ms)', level: 'info' },
  { msg: 'GET /api/products 200 (23ms)', level: 'info' },
  { msg: 'POST /api/orders 500', level: 'error' },
  { msg: 'TypeError: Cannot read properties of undefined', level: 'error' },
  { msg: 'GET /api/health 200 (3ms)', level: 'debug' },
  { msg: 'Cache miss: pricing_user_2kF9', level: 'debug' },
  { msg: 'POST /api/orders 500', level: 'error' },
  { msg: 'Slow query: orders (284ms)', level: 'warn' },
  { msg: 'GET /api/users/me 200 (7ms)', level: 'info' },
  { msg: 'TypeError: Cannot read properties of undefined', level: 'error' },
  { msg: 'Deploy v2.3.1 rollout: 40% traffic', level: 'info' },
  { msg: 'POST /api/orders 500', level: 'error' },
  { msg: 'ECONNRESET on redis:6379', level: 'error' },
  { msg: 'POST /api/cart 200 (28ms)', level: 'info' },
  { msg: 'Hydration mismatch on /checkout', level: 'warn' },
  { msg: 'TypeError: Cannot read properties of undefined', level: 'error' },
]

const sourcesLeft = [
  { label: 'Frontend', icon: 'i-lucide-monitor', sublabel: 'Nuxt / Next.js' },
  { label: 'API Server', icon: 'i-lucide-server', sublabel: 'Nitro / Express' },
]

const sourcesRight = [
  { label: 'Workers', icon: 'i-lucide-cpu', sublabel: 'Background jobs' },
  { label: 'Database', icon: 'i-lucide-database', sublabel: 'Queries & events' },
]

const questions = [
  { text: 'What failed?', answer: 'POST /api/orders' },
  { text: 'Why?', answer: 'new-pricing-engine flag' },
  { text: 'Which users?', answer: 'pro plans only' },
  { text: 'How to fix?', answer: 'Disable flag or update code' },
]

const wideEventFields = [
  { key: 'path', value: '"/api/orders"', branch: '├', color: 'text-sky-400/80' },
  { key: 'error', value: '"Cannot read properties of undefined (reading \'price\')"', branch: '├', color: 'text-red-400/90' },
  { key: 'why', value: '"Flag \'new-pricing-engine\' returns pricing.amount instead of price"', branch: '├', color: 'text-amber-400/80' },
  { key: 'fix', value: '"Disable flag or update OrderService to use pricing.amount"', branch: '├', color: 'text-emerald-400/80' },
  { key: 'user', value: '{ id: "user_2kF9", plan: "pro" }', branch: '├', color: 'text-sky-400/80' },
  { key: 'requestId', value: '"req_4kT8mPqZ"', branch: '└', color: 'text-zinc-500' },
]

function ts() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

function addLog() {
  const t = logTemplates[logId % logTemplates.length]!
  chaosLogs.value.push({ id: logId++, ts: ts(), level: t.level, msg: t.msg, line: lineNum++ })
  if (chaosLogs.value.length > 13) chaosLogs.value.shift()

  if (chaosLogs.value.length >= 10 && !ctaVisible.value) {
    ctaVisible.value = true
  }
}

function startChaos() {
  phase.value = 'chaos'
  visibleFields.value = 0
  ctaVisible.value = false
  chaosLogs.value = []
  logId = 0
  lineNum = 1

  for (let i = 0; i < 5; i++) addLog()
  chaosInterval = setInterval(addLog, 350)
}

function resolve() {
  if (phase.value !== 'chaos') return
  if (chaosInterval) clearInterval(chaosInterval)
  ctaVisible.value = false
  phase.value = 'resolving'

  setTimeout(() => {
    phase.value = 'resolved'

    let count = 0
    fieldInterval = setInterval(() => {
      count++
      visibleFields.value = count
      if (count >= wideEventFields.length) {
        clearInterval(fieldInterval!)
      }
    }, 100)
  }, 700)
}

function reset() {
  if (fieldInterval) clearInterval(fieldInterval)
  startChaos()
}

onMounted(startChaos)

onUnmounted(() => {
  if (chaosInterval) clearInterval(chaosInterval)
  if (fieldInterval) clearInterval(fieldInterval)
})

const levelColors: Record<string, string> = {
  info: 'text-emerald-400',
  debug: 'text-zinc-600',
  warn: 'text-amber-400',
  error: 'text-red-400',
}
</script>

<template>
  <div class="w-full max-w-7xl mx-auto px-4">
    <!-- Sources + Terminal grid -->
    <div class="grid grid-cols-1 lg:grid-cols-[160px_1fr_160px] gap-0 items-center">
      <!-- Left sources with connector lines -->
      <div class="hidden lg:flex flex-col items-end gap-10">
        <div v-for="(src, idx) in sourcesLeft" :key="src.label" class="flex items-center gap-0">
          <div class="flex items-center gap-2 px-3 py-2.5 bg-dark-surface border border-dark-border font-mono text-[10px] shrink-0">
            <UIcon :name="src.icon" class="size-3.5 shrink-0 text-zinc-500" />
            <div class="flex flex-col">
              <span class="font-medium text-[11px] text-zinc-300">{{ src.label }}</span>
              <span class="text-[9px] text-zinc-700">{{ src.sublabel }}</span>
            </div>
          </div>
          <div class="w-5 h-px bg-dark-border relative overflow-hidden">
            <div class="pulse-inward-right h-full" :style="{ animationDelay: `${idx * 0.5}s` }" />
          </div>
        </div>
      </div>

      <!-- Terminal -->
      <div class="mask-b-from-90%">
        <div class="terminal-container overflow-hidden bg-[#06060a] shadow-2xl shadow-black/60">
          <div class="flex items-center border-b border-zinc-800/30 px-5 py-3">
            <div class="flex gap-1.5">
              <div class="size-2.5 rounded-full bg-zinc-800 border border-zinc-700/40" />
              <div class="size-2.5 rounded-full bg-zinc-800 border border-zinc-700/40" />
              <div class="size-2.5 rounded-full bg-zinc-800 border border-zinc-700/40" />
            </div>
            <div class="flex-1 flex justify-center">
              <span class="font-mono text-[10px] tracking-wider uppercase transition-colors duration-500" :class="phase === 'resolved' ? 'text-emerald-500/60' : 'text-zinc-600'">
                {{ phase === 'resolved' ? 'wide event' : phase === 'resolving' ? 'aggregating...' : 'request logs' }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span
                class="size-1.5 rounded-full transition-all duration-700"
                :class="{
                  'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]': phase === 'resolved',
                  'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.4)] animate-pulse': phase === 'resolving',
                  'bg-zinc-600': phase === 'chaos',
                }"
              />
              <span class="font-mono text-[9px] text-zinc-700 uppercase tracking-wider hidden sm:inline">
                {{ phase === 'resolved' ? 'structured' : phase === 'resolving' ? 'processing' : 'live' }}
              </span>
            </div>
          </div>

          <div class="relative h-[340px] md:h-[390px]">
            <div class="absolute inset-x-0 top-0 h-6 bg-linear-to-b from-[#06060a] to-transparent z-10 pointer-events-none" />
            <div class="absolute inset-x-0 bottom-0 h-6 bg-linear-to-t from-[#06060a] to-transparent z-10 pointer-events-none" />
            <div class="absolute inset-0 terminal-dots pointer-events-none" />

            <!-- Chaos Logs -->
            <div
              class="absolute inset-0 px-5 py-4 md:px-6 md:py-5 font-mono text-[11px] md:text-xs overflow-hidden transition-all duration-600"
              :class="phase === 'resolved' ? 'opacity-0 scale-[0.97] blur-xs' : 'opacity-100'"
            >
              <TransitionGroup
                enter-active-class="transition-all duration-200 ease-out"
                enter-from-class="opacity-0 -translate-x-1"
                enter-to-class="opacity-100 translate-x-0"
              >
                <div
                  v-for="(log, i) in chaosLogs"
                  :key="log.id"
                  class="flex items-baseline gap-0 py-[3px] transition-all duration-300"
                  :class="{
                    'latest-line': i === chaosLogs.length - 1 && phase === 'chaos',
                    'error-line': log.level === 'error',
                  }"
                  :style="{ opacity: phase === 'resolving' ? 0.12 : 1 }"
                >
                  <span class="shrink-0 w-7 text-right tabular-nums text-zinc-800 select-none mr-4 text-[10px]">{{ log.line }}</span>
                  <span class="shrink-0 tabular-nums text-zinc-700 select-none mr-3">{{ log.ts }}</span>
                  <span class="shrink-0 w-12 uppercase font-medium mr-3" :class="levelColors[log.level]">{{ log.level }}</span>
                  <span class="truncate" :class="log.level === 'error' ? 'text-red-300/80' : 'text-zinc-400'">{{ log.msg }}</span>
                </div>
              </TransitionGroup>

              <div v-if="phase === 'chaos'" class="flex items-center gap-0 py-[3px] mt-0.5">
                <span class="w-7 mr-4" />
                <span class="text-accent-blue/50 animate-pulse font-mono">▍</span>
              </div>

              <Transition
                enter-active-class="transition-all duration-500 ease-out"
                enter-from-class="opacity-0 scale-95"
                enter-to-class="opacity-100 scale-100"
                leave-active-class="transition-all duration-200"
                leave-from-class="opacity-100"
                leave-to-class="opacity-0 scale-95"
              >
                <div
                  v-if="ctaVisible && phase === 'chaos'"
                  class="absolute inset-0 flex items-center justify-center z-20"
                >
                  <button
                    class="group relative px-6 py-3 bg-accent-blue hover:bg-blue-500 text-white text-xs font-medium transition-all duration-200 active:scale-95 shadow-[0_0_24px_rgba(40,83,255,0.25)] hover:shadow-[0_0_40px_rgba(40,83,255,0.4)] rounded-xs"
                    @click="resolve"
                  >
                    <span class="flex items-center gap-2.5">
                      Fix this with evlog
                      <UIcon name="i-lucide-arrow-right" class="size-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </button>
                </div>
              </Transition>

              <Transition
                enter-active-class="transition-opacity duration-300"
                enter-from-class="opacity-0"
                enter-to-class="opacity-100"
                leave-active-class="transition-opacity duration-200"
                leave-from-class="opacity-100"
                leave-to-class="opacity-0"
              >
                <div
                  v-if="phase === 'resolving'"
                  class="absolute inset-0 flex items-center justify-center bg-[#06060a]/60 backdrop-blur-[2px] z-20"
                >
                  <div class="flex items-center gap-3 px-4 py-2 border border-zinc-800 bg-[#0c0c0e]/95 shadow-xl rounded-full font-mono text-[11px] text-zinc-300">
                    <span class="size-3 border-[1.5px] border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
                    <span>Aggregating context...</span>
                  </div>
                </div>
              </Transition>
            </div>

            <!-- Wide Event -->
            <Transition
              enter-active-class="transition-all duration-600 ease-out"
              enter-from-class="opacity-0 translate-y-3"
              enter-to-class="opacity-100 translate-y-0"
            >
              <div
                v-if="phase === 'resolved'"
                class="absolute inset-0 px-5 py-5 md:px-6 md:py-6 font-mono text-xs md:text-sm"
              >
                <div class="flex items-center gap-3 pb-4 mb-5 border-b border-zinc-800/30">
                  <span class="px-1.5 py-0.5 text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/15 uppercase tracking-widest rounded-xs">error</span>
                  <span class="text-violet-400 font-medium">POST</span>
                  <span class="text-amber-300/80">/api/orders</span>
                  <span class="ml-auto flex items-center gap-2.5 text-zinc-500 text-xs">
                    <span class="text-red-400 font-medium">500</span>
                    <span class="text-zinc-800">|</span>
                    <span class="text-zinc-600">23ms</span>
                  </span>
                </div>

                <div class="space-y-2 ml-1">
                  <div
                    v-for="(field, idx) in wideEventFields"
                    :key="field.key"
                    class="flex items-baseline gap-0 transition-all duration-300 ease-out"
                    :class="idx < visibleFields ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-3'"
                  >
                    <span class="text-zinc-700 mr-2 font-light select-none">{{ field.branch }}─</span>
                    <span class="text-zinc-500 shrink-0 mr-1.5">{{ field.key }}</span>
                    <span class="text-zinc-800 mr-1.5">:</span>
                    <span :class="field.color" class="truncate">{{ field.value }}</span>
                  </div>
                </div>

                <div class="absolute bottom-5 left-5 right-5 md:left-6 md:right-6 flex items-center gap-5 pt-3 border-t border-zinc-800/20 text-[10px] text-zinc-600 font-mono">
                  <span class="flex items-center gap-1.5">
                    <span class="text-emerald-500">&#10003;</span>
                    Root cause identified
                  </span>
                  <span class="flex items-center gap-1.5">
                    <span class="text-emerald-500">&#10003;</span>
                    Fix provided
                  </span>
                  <button
                    class="ml-auto text-zinc-700 hover:text-zinc-400 transition-colors flex items-center gap-1"
                    @click="reset"
                  >
                    <UIcon name="i-lucide-rotate-ccw" class="size-2.5" />
                    replay
                  </button>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </div>

      <!-- Right sources with connector lines -->
      <div class="hidden lg:flex flex-col items-start gap-10">
        <div v-for="(src, idx) in sourcesRight" :key="src.label" class="flex items-center gap-0">
          <div class="w-5 h-px bg-dark-border relative overflow-hidden">
            <div class="pulse-inward-left h-full" :style="{ animationDelay: `${idx * 0.5 + 0.3}s` }" />
          </div>
          <div class="flex items-center gap-2 px-3 py-2.5 bg-dark-surface border border-dark-border font-mono text-[10px] shrink-0">
            <UIcon :name="src.icon" class="size-3.5 shrink-0 text-zinc-500" />
            <div class="flex flex-col">
              <span class="font-medium text-[11px] text-zinc-300">{{ src.label }}</span>
              <span class="text-[9px] text-zinc-700">{{ src.sublabel }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Questions below terminal -->
    <div class="hidden lg:flex justify-center gap-3 mt-6 max-w-4xl mx-auto flex-wrap">
      <div
        v-for="(q, idx) in questions"
        :key="q.text"
        class="transition-all duration-500"
        :style="{ transitionDelay: `${idx * 100}ms` }"
      >
        <div
          class="px-3 py-1.5 border font-mono text-[10px] transition-all duration-500"
          :class="phase === 'resolved'
            ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400/90'
            : 'bg-dark-surface border-dark-border text-zinc-500'"
        >
          <span :class="phase === 'resolved' ? 'text-emerald-500' : 'text-red-400/60'" class="mr-1.5">{{ phase === 'resolved' ? '✓' : '?' }}</span>
          {{ phase === 'resolved' ? q.answer : q.text }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes slide-right {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

@keyframes slide-left {
  0% { transform: translateX(100%); }
  100% { transform: translateX(-100%); }
}

.pulse-inward-right {
  background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.4) 50%, transparent 100%);
  animation: slide-right 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.pulse-inward-left {
  background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.4) 50%, transparent 100%);
  animation: slide-left 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.terminal-container {
  border: 1px solid transparent;
  background-image: linear-gradient(#06060a, #06060a), linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.0) 100%);
  background-origin: border-box;
  background-clip: padding-box, border-box;
}

.terminal-dots {
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.015) 1px, transparent 1px);
  background-size: 20px 20px;
}

.latest-line {
  background: linear-gradient(90deg, rgba(40, 83, 255, 0.04) 0%, transparent 70%);
}

.error-line {
  background: linear-gradient(90deg, rgba(248, 113, 113, 0.04) 0%, transparent 70%);
}
</style>
