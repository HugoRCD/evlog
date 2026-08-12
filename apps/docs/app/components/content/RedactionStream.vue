<script setup lang="ts">
import type { TimedEvent } from '~/composables/useTimedSequence'

interface Field {
  key: string
  raw: string
  masked: string
  kind: 'smart' | 'path' | 'safe'
  pattern?: string
}

const fields: Field[] = [
  { key: 'user.email', raw: '"alice@example.com"', masked: '"a***@***.com"', kind: 'smart', pattern: 'email' },
  { key: 'payment.card', raw: '"4111111111111111"', masked: '"****1111"', kind: 'smart', pattern: 'creditCard' },
  { key: 'user.ip', raw: '"192.168.1.42"', masked: '"***.***.***.42"', kind: 'smart', pattern: 'ipv4' },
  { key: 'auth', raw: '"Bearer sk_live_abc123def"', masked: '"Bearer ***"', kind: 'smart', pattern: 'bearer' },
  { key: 'metadata.password', raw: '"hunter2-correct-horse"', masked: '"[REDACTED]"', kind: 'path', pattern: 'paths' },
  { key: 'user.phone', raw: '"+33 6 12 34 56 78"', masked: '"+33 ****5678"', kind: 'smart', pattern: 'phone' },
  { key: 'user.id', raw: '42', masked: '42', kind: 'safe' },
  { key: 'cart.total', raw: '9999', masked: '9999', kind: 'safe' },
]

const ROW_HEIGHT_PX = 28
const SCAN_DELAY_MS = 520
const SCAN_PRELUDE = 350
const TAIL_HOLD = 3500

const visited = ref<boolean[]>(fields.map(() => false))
const scanY = ref(0)
const scanning = ref(false)
const done = ref(false)
const prefersReducedMotion = ref(false)
const wrapperRef = ref<HTMLElement>()

function resetState() {
  visited.value = fields.map(() => false)
  scanY.value = 0
  done.value = false
  scanning.value = false
}

const events: TimedEvent[] = [
  {
    at: SCAN_PRELUDE,
    run: () => {
      scanning.value = true
    },
  },
  ...fields.map((_, i) => ({
    at: SCAN_PRELUDE + (i + 1) * SCAN_DELAY_MS,
    run: () => {
      scanY.value = (i + 1) * ROW_HEIGHT_PX
      visited.value = visited.value.map((v, idx) => idx <= i ? true : v)
    },
  })),
  {
    at: SCAN_PRELUDE + fields.length * SCAN_DELAY_MS + 200,
    run: () => {
      scanning.value = false
      done.value = true
    },
  },
]

const totalDuration = SCAN_PRELUDE + fields.length * SCAN_DELAY_MS + 200 + TAIL_HOLD

const { start, toggle, restart, paused, started } = useTimedSequence({
  events,
  totalDuration,
  loop: true,
  onReset: resetState,
})

let observer: IntersectionObserver | undefined

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (prefersReducedMotion.value) {
    visited.value = fields.map(() => true)
    done.value = true
    return
  }
  if (!wrapperRef.value) {
    start()
    return
  }
  observer = new IntersectionObserver(
    ([entry]) => {
      if (entry?.isIntersecting) {
        start()
        observer?.disconnect()
      }
    },
    { threshold: 0.3 },
  )
  observer.observe(wrapperRef.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
})

function valueClass(field: Field, idx: number) {
  const isVisited = visited.value[idx]
  if (field.kind === 'safe') {
    return 'text-emerald-400'
  }
  return isVisited
    ? 'text-amber-400'
    : 'text-emerald-400'
}

function display(field: Field, idx: number) {
  return visited.value[idx] ? field.masked : field.raw
}
</script>

<template>
  <div class="not-prose my-8">
    <div ref="wrapperRef" class="overflow-hidden border border-muted bg-default">
      <div class="flex items-center gap-2 border-b border-muted px-4 py-3">
        <div class="flex gap-1.5">
          <div class="size-3 rounded-full bg-accented" />
          <div class="size-3 rounded-full bg-accented" />
          <div class="size-3 rounded-full bg-accented" />
        </div>
        <span class="ml-3 font-mono text-xs text-dimmed">wide event</span>
        <span class="text-dimmed">·</span>
        <span
          class="font-mono text-[10px] tracking-widest uppercase transition-colors duration-500"
          :class="done ? 'text-emerald-500' : 'text-amber-500'"
        >
          {{ done ? 'redacted' : 'raw' }}
        </span>
        <div class="ml-auto hidden sm:flex items-center gap-2 font-mono text-[9px] tracking-widest">
          <span class="size-1.5 rounded-full bg-amber-500/70" />
          <span class="text-dimmed">NODE_ENV=production</span>
        </div>
        <div class="flex items-center gap-0.5 ml-1.5 sm:ml-2">
          <button
            type="button"
            class="size-6 inline-flex items-center justify-center text-dimmed hover:text-default focus:text-default focus:outline-none transition-colors"
            :aria-label="paused ? 'Play animation' : 'Pause animation'"
            :disabled="!started"
            @click="toggle"
          >
            <UIcon :name="paused ? 'i-lucide-play' : 'i-lucide-pause'" class="size-3" />
          </button>
          <button
            type="button"
            class="size-6 inline-flex items-center justify-center text-dimmed hover:text-default focus:text-default focus:outline-none transition-colors"
            aria-label="Restart animation"
            :disabled="!started"
            @click="restart"
          >
            <UIcon name="i-lucide-rotate-ccw" class="size-3" />
          </button>
        </div>
      </div>

      <div class="relative px-4 sm:px-6 py-4 font-mono text-[11px] sm:text-xs">
        <div
          v-show="scanning"
          aria-hidden="true"
          class="pointer-events-none absolute inset-x-0 h-px transition-[top] ease-out"
          :style="{
            top: `${scanY + 12}px`,
            transitionDuration: `${SCAN_DELAY_MS}ms`,
            background: 'linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--color-amber-500) 80%, transparent) 50%, transparent 100%)',
            boxShadow: '0 0 8px color-mix(in srgb, var(--color-amber-500) 60%, transparent)',
          }"
        />

        <div class="space-y-1">
          <div
            v-for="(field, i) in fields"
            :key="field.key"
            class="grid grid-cols-[140px_minmax(0,1fr)_auto] sm:grid-cols-[180px_minmax(0,1fr)_auto] items-center gap-3 py-1"
            :style="{ height: `${ROW_HEIGHT_PX - 4}px` }"
          >
            <span
              class="text-sky-400 truncate transition-colors duration-300"
              :class="visited[i] && field.kind !== 'safe' ? 'text-sky-300' : ''"
            >
              {{ field.key }}
            </span>
            <span
              class="truncate transition-colors duration-500"
              :class="valueClass(field, i)"
            >
              {{ display(field, i) }}
            </span>
            <span class="flex items-center gap-1.5 justify-end">
              <span
                v-if="!visited[i]"
                class="font-mono text-[9px] text-dimmed/60 tracking-widest"
              >
                ...
              </span>
              <template v-else>
                <span
                  v-if="field.kind === 'safe'"
                  class="inline-flex items-center gap-1 text-[9px] tracking-widest text-emerald-500"
                >
                  <UIcon name="i-lucide-check" class="size-3" />
                  <span class="hidden sm:inline">SAFE</span>
                </span>
                <span
                  v-else-if="field.kind === 'path'"
                  class="inline-flex items-center gap-1 text-[9px] tracking-widest text-rose-400"
                >
                  <UIcon name="i-lucide-shield-x" class="size-3" />
                  <span class="hidden sm:inline">PATH</span>
                </span>
                <span
                  v-else
                  class="inline-flex items-center gap-1 text-[9px] tracking-widest text-amber-500"
                >
                  <UIcon name="i-lucide-eye-off" class="size-3" />
                  <span class="hidden sm:inline">{{ field.pattern }}</span>
                </span>
              </template>
            </span>
          </div>
        </div>
      </div>

      <div class="border-t border-muted/50 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[10px] text-dimmed">
        <span class="inline-flex items-center gap-1.5">
          <span class="size-1.5 rounded-full bg-amber-500" />
          smart mask
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="size-1.5 rounded-full bg-rose-400" />
          path redact
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="size-1.5 rounded-full bg-emerald-500" />
          untouched
        </span>
        <span class="ml-auto transition-opacity duration-500" :class="done ? 'opacity-100 text-emerald-500' : 'opacity-0'">
          ready for drain · 0 PII leaked
        </span>
      </div>
    </div>
  </div>
</template>
