<script setup lang="ts">
import type { TimedEvent } from '~/composables/useTimedSequence'

interface EventRow {
  id: string
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  path: string
  audit: boolean
  random?: number
}

const requests: EventRow[] = [
  { id: '1', method: 'POST', path: '/api/checkout', audit: false, random: 0.42 },
  { id: '2', method: 'GET', path: '/api/users', audit: false, random: 0.91 },
  { id: '3', method: 'POST', path: '/api/refund', audit: true },
  { id: '4', method: 'GET', path: '/api/me', audit: false, random: 0.07 },
  { id: '5', method: 'POST', path: '/api/login', audit: true },
  { id: '6', method: 'PATCH', path: '/api/cart', audit: false, random: 0.55 },
  { id: '7', method: 'DELETE', path: '/api/account', audit: true },
  { id: '8', method: 'GET', path: '/api/health', audit: false, random: 0.83 },
]

const KEEP_RATE = 0.1

type RowPhase = 'hidden' | 'incoming' | 'evaluated' | 'resolved'

const rowPhase = ref<RowPhase[]>(requests.map(() => 'hidden'))
const prefersReducedMotion = ref(false)
const wrapperRef = ref<HTMLElement>()

function resetState() {
  rowPhase.value = requests.map(() => 'hidden')
}

const ROW_INTERVAL = 650
const PHASE_INCOMING_AT = 200
const PHASE_EVALUATED_AT = 300
const PHASE_RESOLVED_AT = 500
const TAIL_HOLD = 3500

function buildEvents(): TimedEvent[] {
  const events: TimedEvent[] = []

  requests.forEach((_, i) => {
    const base = i * ROW_INTERVAL
    events.push({
      at: base + PHASE_INCOMING_AT,
      run: () => {
        rowPhase.value = rowPhase.value.map((p, idx) => idx === i ? 'incoming' : p)
      },
    })
    events.push({
      at: base + PHASE_INCOMING_AT + PHASE_EVALUATED_AT,
      run: () => {
        rowPhase.value = rowPhase.value.map((p, idx) => idx === i ? 'evaluated' : p)
      },
    })
    events.push({
      at: base + PHASE_INCOMING_AT + PHASE_EVALUATED_AT + PHASE_RESOLVED_AT,
      run: () => {
        rowPhase.value = rowPhase.value.map((p, idx) => idx === i ? 'resolved' : p)
      },
    })
  })

  return events
}

const events = buildEvents()
const totalDuration = requests.length * ROW_INTERVAL + PHASE_INCOMING_AT + PHASE_EVALUATED_AT + PHASE_RESOLVED_AT + TAIL_HOLD

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
    rowPhase.value = requests.map(() => 'resolved')
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
    { threshold: 0.25 },
  )
  observer.observe(wrapperRef.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
})

function isKept(row: EventRow) {
  if (row.audit) return true
  return (row.random ?? 1) < KEEP_RATE
}

function methodColor(method: string) {
  switch (method) {
    case 'POST': return 'text-violet-400'
    case 'GET': return 'text-sky-400'
    case 'PATCH': return 'text-amber-400'
    case 'DELETE': return 'text-rose-400'
    default: return 'text-muted'
  }
}

const stats = computed(() => {
  const resolved = requests.filter((_, i) => rowPhase.value[i] === 'resolved')
  const keptAudit = resolved.filter(r => r.audit).length
  const keptRegular = resolved.filter(r => !r.audit && isKept(r)).length
  const dropped = resolved.filter(r => !r.audit && !isKept(r)).length
  const totalAudit = requests.filter(r => r.audit).length
  return {
    keptAudit,
    keptRegular,
    dropped,
    totalAudit,
    total: resolved.length,
  }
})
</script>

<template>
  <div class="not-prose my-8" data-section="audit-force-keep">
    <div ref="wrapperRef" class="overflow-hidden border border-muted bg-default">
      <div class="flex items-center gap-2 border-b border-muted px-4 py-2.5">
        <UIcon name="i-lucide-filter" class="size-3.5 text-primary" />
        <span class="font-mono text-xs text-dimmed">tail-sample gate</span>
        <span class="text-dimmed">·</span>
        <span class="font-mono text-[10px] tracking-widest uppercase text-amber-400">
          keep rate {{ Math.round(KEEP_RATE * 100) }}%
        </span>
        <div class="ml-auto hidden sm:flex items-center gap-1.5 font-mono text-[9px] tracking-widest text-dimmed">
          <UIcon name="i-lucide-shield" class="size-3 text-primary" />
          <span>audit = force-keep</span>
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

      <div class="hidden sm:grid grid-cols-[minmax(0,1fr)_140px_minmax(0,140px)] items-center gap-3 px-4 sm:px-6 py-2 border-b border-default/30 font-mono text-[9px] tracking-widest uppercase text-dimmed">
        <span>incoming</span>
        <span>gate decision</span>
        <span class="text-right">outcome</span>
      </div>

      <div class="px-4 sm:px-6 py-3 space-y-1.5">
        <div
          v-for="(row, i) in requests"
          :key="row.id"
          class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_140px_minmax(0,140px)] items-center gap-2 sm:gap-3 py-1.5 transition-all duration-500"
          :class="rowPhase[i] === 'hidden' ? 'opacity-0 -translate-x-2' : 'opacity-100 translate-x-0'"
        >
          <div class="flex items-center gap-2 font-mono text-[11px] sm:text-xs min-w-0">
            <UIcon
              v-if="row.audit"
              name="i-lucide-shield"
              class="size-3.5 text-primary shrink-0"
            />
            <span v-else class="size-3.5 shrink-0" aria-hidden="true" />
            <span class="text-dimmed shrink-0">#{{ row.id }}</span>
            <span class="shrink-0" :class="methodColor(row.method)">{{ row.method }}</span>
            <span class="text-muted truncate">{{ row.path }}</span>
          </div>

          <div
            class="font-mono text-[10px] sm:text-[11px] transition-opacity duration-300 min-w-0 truncate"
            :class="(rowPhase[i] === 'evaluated' || rowPhase[i] === 'resolved') ? 'opacity-100' : 'opacity-0'"
          >
            <span v-if="row.audit" class="inline-flex items-center gap-1.5 text-primary">
              <UIcon name="i-lucide-arrow-down-to-line" class="size-3" />
              <span>audit · force</span>
            </span>
            <span v-else class="text-dimmed">
              random
              <span :class="(row.random ?? 1) < KEEP_RATE ? 'text-emerald-400' : 'text-muted'">{{ (row.random ?? 0).toFixed(2) }}</span>
              <span class="text-dimmed/60"> &lt; {{ KEEP_RATE.toFixed(2) }}</span>
            </span>
          </div>

          <div
            class="justify-self-end font-mono text-[10px] tracking-widest uppercase transition-opacity duration-300"
            :class="rowPhase[i] === 'resolved' ? 'opacity-100' : 'opacity-0'"
          >
            <span v-if="isKept(row) && row.audit" class="inline-flex items-center gap-1 text-primary">
              <UIcon name="i-lucide-arrow-right-to-line" class="size-3" />
              <span>kept</span>
            </span>
            <span v-else-if="isKept(row)" class="inline-flex items-center gap-1 text-emerald-400">
              <UIcon name="i-lucide-arrow-right-to-line" class="size-3" />
              <span>kept</span>
            </span>
            <span v-else class="inline-flex items-center gap-1 text-muted line-through decoration-muted/60">
              <UIcon class="size-3 no-underline" name="i-lucide-trash-2" />
              <span>dropped</span>
            </span>
          </div>
        </div>
      </div>

      <div class="border-t border-muted/50 px-4 py-3 grid grid-cols-3 gap-3 font-mono text-[10px]">
        <div class="flex flex-col gap-0.5">
          <span class="text-dimmed text-[9px] tracking-widest uppercase">audit kept</span>
          <span class="text-primary">{{ stats.keptAudit }} / {{ stats.totalAudit }} <span class="text-dimmed">(100%)</span></span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-dimmed text-[9px] tracking-widest uppercase">regular kept</span>
          <span class="text-emerald-400">{{ stats.keptRegular }} <span class="text-dimmed">/ ~{{ Math.round(KEEP_RATE * 100) }}%</span></span>
        </div>
        <div class="flex flex-col gap-0.5 text-right">
          <span class="text-dimmed text-[9px] tracking-widest uppercase">dropped</span>
          <span class="text-muted">{{ stats.dropped }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
