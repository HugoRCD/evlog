<script setup lang="ts">
import type { TimedEvent } from '~/composables/useTimedSequence'

interface Rule {
  id: string
  label: string
}

interface RequestRow {
  id: string
  method: 'GET' | 'POST' | 'DELETE'
  path: string
  status: number
  duration: number
  matches: boolean[]
  random: number
}

const KEEP_RATE = 0.1

const rules: Rule[] = [
  { id: 'status', label: 'status ≥ 400' },
  { id: 'duration', label: 'duration ≥ 1000' },
  { id: 'path', label: 'path: /api/payments/**' },
]

const requests: RequestRow[] = [
  { id: '1', method: 'POST', path: '/api/users', status: 200, duration: 45, matches: [false, false, false], random: 0.42 },
  { id: '2', method: 'POST', path: '/api/users', status: 500, duration: 45, matches: [true, false, false], random: 0.91 },
  { id: '3', method: 'GET', path: '/api/products', status: 200, duration: 2300, matches: [false, true, false], random: 0.71 },
  { id: '4', method: 'POST', path: '/api/payments/charge', status: 200, duration: 120, matches: [false, false, true], random: 0.55 },
  { id: '5', method: 'POST', path: '/api/checkout', status: 200, duration: 120, matches: [false, false, false], random: 0.07 },
  { id: '6', method: 'GET', path: '/api/health', status: 200, duration: 12, matches: [false, false, false], random: 0.83 },
]

type RowPhase = 'hidden' | 'visible' | 'tail-evaluated' | 'head-rolled' | 'resolved'

const rowPhase = ref<RowPhase[]>(requests.map(() => 'hidden'))
const rulesShown = ref<number[]>(requests.map(() => 0))
const prefersReducedMotion = ref(false)
const wrapperRef = ref<HTMLElement>()

function resetState() {
  rowPhase.value = requests.map(() => 'hidden')
  rulesShown.value = requests.map(() => 0)
}

const ENTER_AT = 200
const ROW_INTERVAL = 1300
const RULE_INTERVAL = 220
const HEAD_ROLL_AT = ENTER_AT + 250 + rules.length * RULE_INTERVAL
const RESOLVE_AT = HEAD_ROLL_AT + 300
const TAIL_HOLD = 4000

function buildEvents(): TimedEvent[] {
  const events: TimedEvent[] = []

  requests.forEach((row, i) => {
    const base = i * ROW_INTERVAL

    events.push({
      at: base + ENTER_AT,
      run: () => {
        rowPhase.value = rowPhase.value.map((p, idx) => idx === i ? 'visible' : p)
      },
    })

    rules.forEach((_, ruleIdx) => {
      events.push({
        at: base + ENTER_AT + 250 + ruleIdx * RULE_INTERVAL,
        run: () => {
          rulesShown.value = rulesShown.value.map((v, idx) => idx === i ? ruleIdx + 1 : v)
        },
      })
    })

    events.push({
      at: base + ENTER_AT + 250 + rules.length * RULE_INTERVAL,
      run: () => {
        rowPhase.value = rowPhase.value.map((p, idx) => idx === i ? 'tail-evaluated' : p)
      },
    })

    const tailMatched = row.matches.some(m => m)
    if (!tailMatched) {
      events.push({
        at: base + HEAD_ROLL_AT,
        run: () => {
          rowPhase.value = rowPhase.value.map((p, idx) => idx === i ? 'head-rolled' : p)
        },
      })
    }

    events.push({
      at: base + RESOLVE_AT,
      run: () => {
        rowPhase.value = rowPhase.value.map((p, idx) => idx === i ? 'resolved' : p)
      },
    })
  })

  return events
}

const events = buildEvents()
const totalDuration = ENTER_AT + requests.length * ROW_INTERVAL + TAIL_HOLD

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
    rulesShown.value = requests.map(() => rules.length)
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

function methodColor(method: string) {
  switch (method) {
    case 'POST': return 'text-violet-400'
    case 'GET': return 'text-sky-400'
    case 'DELETE': return 'text-rose-400'
    default: return 'text-muted'
  }
}

function statusColor(status: number) {
  if (status >= 500) return 'text-rose-400'
  if (status >= 400) return 'text-amber-400'
  return 'text-emerald-400'
}

function isTailKept(row: RequestRow) {
  return row.matches.some(m => m)
}

function tailReason(row: RequestRow) {
  const idx = row.matches.findIndex(m => m)
  if (idx < 0) return null
  return rules[idx]?.label
}

function isHeadKept(row: RequestRow) {
  return row.random < KEEP_RATE
}

function isKept(row: RequestRow) {
  return isTailKept(row) || isHeadKept(row)
}

const stats = computed(() => {
  const resolved = requests.filter((_, i) => rowPhase.value[i] === 'resolved')
  const kept = resolved.filter(r => isKept(r))
  const force = kept.filter(r => isTailKept(r)).length
  const head = kept.filter(r => !isTailKept(r) && isHeadKept(r)).length
  const dropped = resolved.length - kept.length
  return { kept: kept.length, force, head, dropped, total: resolved.length }
})
</script>

<template>
  <div class="not-prose my-8" data-section="tail-sample-decision">
    <div ref="wrapperRef" class="overflow-hidden border border-muted bg-default">
      <div class="flex items-center gap-2 border-b border-muted px-4 py-2.5">
        <UIcon name="i-lucide-funnel" class="size-3.5 text-primary" />
        <span class="font-mono text-xs text-dimmed">sampling decision</span>
        <span class="text-dimmed">·</span>
        <span class="font-mono text-[10px] tracking-widest uppercase text-amber-400">
          tail → head
        </span>
        <div class="ml-auto hidden sm:flex items-center gap-1.5 font-mono text-[9px] tracking-widest text-dimmed">
          <span>head info: {{ Math.round(KEEP_RATE * 100) }}%</span>
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

      <div class="border-b border-default/30 px-4 sm:px-6 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-muted">
        <span class="text-dimmed">tail rules:</span>
        <span
          v-for="rule in rules"
          :key="rule.id"
          class="inline-flex items-center gap-1 text-muted"
        >
          <span class="size-1 rounded-full bg-muted/60" />
          {{ rule.label }}
        </span>
      </div>

      <div class="px-4 sm:px-6 py-3 space-y-1">
        <div
          v-for="(row, i) in requests"
          :key="row.id"
          class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,140px)] sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,160px)] items-center gap-3 py-1.5 transition-all duration-500"
          :class="rowPhase[i] === 'hidden' ? 'opacity-0 -translate-x-2' : 'opacity-100 translate-x-0'"
        >
          <div class="flex items-center gap-2 font-mono text-[11px] sm:text-xs min-w-0">
            <span class="text-dimmed shrink-0">#{{ row.id }}</span>
            <span class="shrink-0" :class="methodColor(row.method)">{{ row.method }}</span>
            <span class="text-muted truncate">{{ row.path }}</span>
            <span class="text-dimmed shrink-0">·</span>
            <span class="shrink-0" :class="statusColor(row.status)">{{ row.status }}</span>
            <span class="text-dimmed shrink-0">·</span>
            <span class="text-muted shrink-0">{{ row.duration }}ms</span>
          </div>

          <div class="flex items-center gap-1 sm:gap-1.5">
            <span
              v-for="(_rule, ruleIdx) in rules"
              :key="`${row.id}-${ruleIdx}`"
              class="size-3.5 inline-flex items-center justify-center transition-all duration-300"
              :class="(rulesShown[i] ?? 0) > ruleIdx ? 'opacity-100 scale-100' : 'opacity-0 scale-50'"
            >
              <UIcon
                v-if="row.matches[ruleIdx]"
                name="i-lucide-check"
                class="size-3 text-emerald-400"
              />
              <UIcon
                v-else
                name="i-lucide-x"
                class="size-3 text-dimmed/50"
              />
            </span>
          </div>

          <div
            class="justify-self-end font-mono text-[10px] tracking-widest uppercase transition-opacity duration-300 min-w-0 truncate text-right"
            :class="rowPhase[i] === 'resolved' ? 'opacity-100' : 'opacity-0'"
          >
            <span v-if="isTailKept(row)" class="inline-flex items-center gap-1 text-emerald-400">
              <UIcon name="i-lucide-arrow-right-to-line" class="size-3" />
              <span class="hidden sm:inline">force-kept</span>
              <span class="sm:hidden">kept</span>
            </span>
            <span v-else-if="isHeadKept(row)" class="inline-flex items-center gap-1 text-emerald-400/80">
              <UIcon name="i-lucide-dice-5" class="size-3" />
              <span class="hidden sm:inline">head ({{ row.random.toFixed(2) }})</span>
              <span class="sm:hidden">kept</span>
            </span>
            <span v-else class="inline-flex items-center gap-1 text-muted line-through decoration-muted/60">
              <UIcon name="i-lucide-trash-2" class="size-3 no-underline" />
              <span>dropped</span>
            </span>
          </div>

          <div
            v-if="rowPhase[i] === 'resolved' && tailReason(row)"
            class="hidden sm:block col-span-3 font-mono text-[10px] text-dimmed pl-6 -mt-1"
          >
            <span class="text-emerald-400/70">↳</span>
            matched <span class="text-muted">{{ tailReason(row) }}</span>
          </div>
        </div>
      </div>

      <div class="border-t border-muted/50 px-4 py-3 grid grid-cols-3 gap-3 font-mono text-[10px]">
        <div class="flex flex-col gap-0.5">
          <span class="text-dimmed text-[9px] tracking-widest uppercase">tail-kept</span>
          <span class="text-emerald-400">{{ stats.force }} <span class="text-dimmed">/ {{ stats.total }}</span></span>
        </div>
        <div class="flex flex-col gap-0.5 text-center">
          <span class="text-dimmed text-[9px] tracking-widest uppercase">head-kept</span>
          <span class="text-emerald-400/70">{{ stats.head }} <span class="text-dimmed">/ {{ stats.total }}</span></span>
        </div>
        <div class="flex flex-col gap-0.5 text-right">
          <span class="text-dimmed text-[9px] tracking-widest uppercase">dropped</span>
          <span class="text-muted">{{ stats.dropped }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
