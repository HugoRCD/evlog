<script setup lang="ts">
import { Motion } from 'motion-v'

const prefersReducedMotion = ref(false)
const animationStarted = ref(false)
const phase = ref<'idle' | 'head' | 'tail' | 'done'>('idle')
const panelRef = ref<HTMLElement>()

interface LogEntry {
  level: 'INFO' | 'WARN' | 'ERROR'
  method: string
  path: string
  duration: number
  headKept: boolean
  tailRescued: boolean
}

const logs: LogEntry[] = [
  { level: 'INFO', method: 'GET', path: '/api/users', duration: 45, headKept: false, tailRescued: false },
  { level: 'INFO', method: 'POST', path: '/api/orders', duration: 120, headKept: true, tailRescued: false },
  { level: 'INFO', method: 'GET', path: '/api/health', duration: 12, headKept: false, tailRescued: false },
  { level: 'WARN', method: 'POST', path: '/api/payment', duration: 340, headKept: true, tailRescued: false },
  { level: 'INFO', method: 'GET', path: '/api/search', duration: 1240, headKept: false, tailRescued: true },
  { level: 'ERROR', method: 'POST', path: '/api/checkout', duration: 450, headKept: true, tailRescued: false },
  { level: 'INFO', method: 'GET', path: '/api/feed', duration: 32, headKept: false, tailRescued: false },
  { level: 'INFO', method: 'POST', path: '/api/critical/alert', duration: 55, headKept: false, tailRescued: true },
]

const pills = [
  { label: 'Head sampling', icon: 'i-lucide-percent' },
  { label: 'Tail sampling', icon: 'i-lucide-filter' },
  { label: 'Per-level rates', icon: 'i-lucide-sliders-horizontal' },
]

const timers: ReturnType<typeof setTimeout>[] = []
let observer: IntersectionObserver | undefined

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (prefersReducedMotion.value) {
    phase.value = 'done'
    return
  }
  if (panelRef.value) {
    observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          startAnimation()
          observer?.disconnect()
        }
      },
      { threshold: 0.3 },
    )
    observer.observe(panelRef.value)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  timers.forEach(clearTimeout)
})

function startAnimation() {
  if (animationStarted.value) return
  animationStarted.value = true
  timers.push(setTimeout(() => {
    phase.value = 'head' 
  }, 800))
  timers.push(setTimeout(() => {
    phase.value = 'tail' 
  }, 2200))
  timers.push(setTimeout(() => {
    phase.value = 'done' 
  }, 3400))
}

function getLogState(log: LogEntry): 'normal' | 'kept' | 'dropped' | 'rescued' {
  if (phase.value === 'idle') return 'normal'
  if (phase.value === 'head') return log.headKept ? 'kept' : 'dropped'
  if (log.tailRescued) return 'rescued'
  if (log.headKept) return 'kept'
  return 'dropped'
}

function getLevelColor(level: string): string {
  if (level === 'ERROR') return 'text-red-500'
  if (level === 'WARN') return 'text-amber-500'
  return 'text-emerald-500'
}
</script>

<template>
  <section class="py-24 md:py-32">
    <Motion
      :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
      :in-view="{ opacity: 1, y: 0 }"
      :transition="{ duration: 0.5 }"
      :in-view-options="{ once: true }"
      class="mb-10"
    >
      <div>
        <p class="section-label">
          Sampling
        </p>
        <div class="relative mb-5">
          <h2 class="section-title max-w-xl">
            Keep what matters<span class="text-primary">.</span>
          </h2>
          <div aria-hidden="true" class="absolute inset-0 section-title max-w-xl blur-xs animate-pulse">
            Keep what matters<span class="text-primary">.</span>
          </div>
        </div>
        <p class="max-w-lg text-sm leading-relaxed text-zinc-400">
          Two-tier filtering: head sampling drops noise by level, tail sampling rescues critical events. Never miss errors, slow requests, or critical paths.
        </p>
        <div class="mt-5 flex flex-wrap gap-2">
          <span
            v-for="pill in pills"
            :key="pill.label"
            class="inline-flex items-center gap-1.5 border border-zinc-800 bg-zinc-900/50 px-3 py-1 font-mono text-[11px] text-zinc-400"
          >
            <UIcon :name="pill.icon" class="size-3 text-amber-500" />
            {{ pill.label }}
          </span>
        </div>
        <NuxtLink to="/core-concepts/sampling" class="mt-4 inline-flex items-center gap-1.5 font-mono text-xs text-zinc-500 hover:text-accent-blue transition-colors">
          Sampling guide
          <UIcon name="i-lucide-arrow-right" class="size-3" />
        </NuxtLink>
      </div>
    </Motion>

    <div class="grid gap-6 lg:grid-cols-2 *:min-w-0">
      <!-- Left: Config code -->
      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
        :in-view="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5, delay: 0.1 }"
        :in-view-options="{ once: true }"
      >
        <div class="h-full overflow-hidden border border-zinc-800 bg-[#0c0c0e]">
          <div class="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <div class="flex gap-1.5">
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
            </div>
            <span class="ml-3 font-mono text-xs text-zinc-600">evlog.config.ts</span>
          </div>
          <div class="p-5 font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto">
            <!-- eslint-disable vue/multiline-html-element-content-newline -->
            <pre><code><span class="text-amber-400">initLogger</span>({
  <span class="text-sky-400">sampling</span>: {
    <span class="text-zinc-500">// Head: per-level rates</span>
    <span class="text-sky-400">rates</span>: {
      <span class="text-sky-400">info</span>:  <span class="text-pink-400">10</span>,   <span class="text-zinc-600">// keep 10%</span>
      <span class="text-sky-400">warn</span>:  <span class="text-pink-400">50</span>,   <span class="text-zinc-600">// keep 50%</span>
      <span class="text-sky-400">error</span>: <span class="text-pink-400">100</span>,  <span class="text-zinc-600">// always</span>
    },
    <span class="text-zinc-500">// Tail: force keep if match</span>
    <span class="text-sky-400">keep</span>: [
      { <span class="text-sky-400">status</span>: <span class="text-pink-400">400</span> },
      { <span class="text-sky-400">duration</span>: <span class="text-pink-400">1000</span> },
      { <span class="text-sky-400">path</span>: <span class="text-emerald-400">'/api/critical/**'</span> },
    ]
  }
})</code></pre>
            <!-- eslint-enable -->
          </div>
        </div>
      </Motion>

      <!-- Right: Animated log stream -->
      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
        :in-view="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5, delay: 0.2 }"
        :in-view-options="{ once: true }"
      >
        <div ref="panelRef" class="h-full overflow-hidden border border-zinc-800 bg-[#0c0c0e]">
          <div class="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <div class="flex gap-1.5">
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
            </div>
            <span class="ml-3 font-mono text-xs text-zinc-600">log stream</span>
            <div class="ml-auto flex items-center gap-3 font-mono text-[9px] tracking-wider">
              <span
                class="transition-colors duration-300"
                :class="phase === 'head' ? 'text-amber-500' : (phase !== 'idle' ? 'text-zinc-600' : 'text-zinc-700')"
              >HEAD</span>
              <span
                class="transition-colors duration-300"
                :class="phase === 'tail' || phase === 'done' ? 'text-accent-blue' : 'text-zinc-700'"
              >TAIL</span>
            </div>
          </div>

          <div class="p-3 sm:p-4 font-mono text-[11px] sm:text-xs">
            <div
              v-for="(log, i) in logs"
              :key="i"
              class="flex items-center gap-1.5 sm:gap-2 py-1 border-l-2 pl-2.5 sm:pl-3 transition-all duration-500"
              :class="{
                'border-transparent': getLogState(log) === 'normal',
                'border-emerald-500/40': getLogState(log) === 'kept',
                'border-zinc-800 opacity-25': getLogState(log) === 'dropped',
                'border-accent-blue/60 bg-accent-blue/[0.03]': getLogState(log) === 'rescued',
              }"
            >
              <span
                class="w-10 shrink-0 font-medium transition-colors duration-500"
                :class="getLogState(log) === 'dropped' ? 'text-zinc-700' : getLevelColor(log.level)"
              >{{ log.level }}</span>
              <span
                class="hidden sm:inline w-8 shrink-0 transition-colors duration-500"
                :class="getLogState(log) === 'dropped' ? 'text-zinc-700' : 'text-violet-400'"
              >{{ log.method }}</span>
              <span
                class="truncate transition-colors duration-500"
                :class="getLogState(log) === 'dropped' ? 'text-zinc-700' : 'text-zinc-400'"
              >{{ log.path }}</span>
              <span
                class="ml-auto shrink-0 tabular-nums transition-colors duration-500"
                :class="{
                  'text-zinc-800': getLogState(log) === 'dropped',
                  'text-amber-500': getLogState(log) !== 'dropped' && log.duration >= 1000,
                  'text-zinc-600': getLogState(log) !== 'dropped' && log.duration < 1000,
                }"
              >{{ log.duration }}ms</span>
              <span
                class="w-3 text-center shrink-0 transition-opacity duration-500"
                :class="phase === 'idle' ? 'opacity-0' : 'opacity-100'"
              >
                <span v-if="getLogState(log) === 'dropped'" class="text-zinc-700">&times;</span>
                <span v-else-if="getLogState(log) === 'rescued'" class="text-accent-blue">&uarr;</span>
                <span v-else-if="getLogState(log) === 'kept'" class="text-emerald-500">&#10003;</span>
              </span>
            </div>
          </div>

          <div
            class="border-t border-zinc-800 px-4 py-3 transition-opacity duration-500"
            :class="phase === 'done' ? 'opacity-100' : 'opacity-0'"
          >
            <p class="font-mono text-[10px] text-zinc-500">
              <span class="text-emerald-500">5 kept</span>
              <span class="mx-1.5">&middot;</span>
              <span class="text-zinc-600">3 dropped</span>
              <span class="mx-1.5">&middot;</span>
              noise reduced without data loss
            </p>
          </div>
        </div>
      </Motion>
    </div>
  </section>
</template>
