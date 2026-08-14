<script setup lang="ts">
import type { TimedEvent } from '~/composables/useTimedSequence'

interface LevelRow {
  id: 'info' | 'warn' | 'debug' | 'error'
  label: string
  rate: number
  accent: string
  dotColor: string
  keptColor: string
  droppedColor: string
}

const TOTAL_DOTS = 100

const levels: LevelRow[] = [
  {
    id: 'info',
    label: 'info',
    rate: 10,
    accent: 'text-emerald-400',
    dotColor: 'bg-emerald-400',
    keptColor: 'bg-emerald-500',
    droppedColor: 'bg-rose-400/40',
  },
  {
    id: 'warn',
    label: 'warn',
    rate: 50,
    accent: 'text-amber-400',
    dotColor: 'bg-amber-400',
    keptColor: 'bg-amber-500',
    droppedColor: 'bg-rose-400/40',
  },
  {
    id: 'debug',
    label: 'debug',
    rate: 0,
    accent: 'text-sky-400',
    dotColor: 'bg-sky-400',
    keptColor: 'bg-sky-500',
    droppedColor: 'bg-rose-400/40',
  },
  {
    id: 'error',
    label: 'error',
    rate: 100,
    accent: 'text-rose-400',
    dotColor: 'bg-rose-400',
    keptColor: 'bg-rose-500',
    droppedColor: 'bg-rose-400/40',
  },
]

function deterministicMask(seed: number, count: number, rate: number) {
  const mask: boolean[] = []
  let kept = 0
  const target = Math.round((rate / 100) * count)
  for (let i = 0; i < count; i++) {
    const x = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453
    const r = x - Math.floor(x)
    if (kept < target && (r < rate / 100 || (count - i) <= (target - kept))) {
      mask.push(true)
      kept++
    } else {
      mask.push(false)
    }
  }
  return mask
}

const masks = levels.map((l, i) => deterministicMask(i + 1, TOTAL_DOTS, l.rate))

const revealed = ref<number[]>(levels.map(() => 0))
const phase = ref<'idle' | 'flowing' | 'done'>('idle')
const prefersReducedMotion = ref(false)
const wrapperRef = ref<HTMLElement>()

function resetState() {
  revealed.value = levels.map(() => 0)
  phase.value = 'idle'
}

const START_AT = 200
const DOT_INTERVAL = 14
const ROW_STAGGER = 60
const SETTLE_HOLD = 4500

function buildEvents(): TimedEvent[] {
  const events: TimedEvent[] = []

  events.push({ at: START_AT - 50, run: () => {
    phase.value = 'flowing' 
  } })

  let maxAt = 0
  levels.forEach((_, rowIdx) => {
    for (let i = 1; i <= TOTAL_DOTS; i++) {
      const at = START_AT + rowIdx * ROW_STAGGER + i * DOT_INTERVAL
      maxAt = Math.max(maxAt, at)
      events.push({
        at,
        run: () => {
          const next = [...revealed.value]
          next[rowIdx] = i
          revealed.value = next
        },
      })
    }
  })

  events.push({ at: maxAt + 200, run: () => {
    phase.value = 'done' 
  } })
  return events
}

const events = buildEvents()
const totalDuration = START_AT + (levels.length - 1) * ROW_STAGGER + TOTAL_DOTS * DOT_INTERVAL + SETTLE_HOLD

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
    revealed.value = levels.map(() => TOTAL_DOTS)
    phase.value = 'done'
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

const totals = computed(() => {
  return levels.map((l, i) => {
    const r = revealed.value[i] ?? 0
    let kept = 0
    let dropped = 0
    for (let j = 0; j < r; j++) {
      if (masks[i]?.[j]) kept++
      else dropped++
    }
    return { kept, dropped, total: r, rate: l.rate }
  })
})

const allDone = computed(() => phase.value === 'done')
</script>

<template>
  <div class="not-prose my-8" data-section="head-sampling-plinko">
    <div ref="wrapperRef" class="overflow-hidden border border-muted bg-default">
      <div class="flex items-center gap-2 border-b border-muted px-4 py-2">
        <div class="flex gap-1.5">
          <div class="size-3 rounded-full bg-accented" />
          <div class="size-3 rounded-full bg-accented" />
          <div class="size-3 rounded-full bg-accented" />
        </div>
        <span class="ml-3 font-mono text-xs text-dimmed">head sampling · 100 events / level</span>
        <span class="text-dimmed">·</span>
        <span
          class="font-mono text-[10px] tracking-widest uppercase transition-colors duration-300"
          :class="allDone ? 'text-primary' : 'text-amber-400'"
        >
          {{ allDone ? 'sampled' : 'flowing' }}
        </span>
        <div class="ml-auto hidden sm:flex items-center gap-1.5 font-mono text-[9px] tracking-widest text-dimmed">
          <UIcon name="i-lucide-filter" class="size-3 text-primary" />
          <span>random per call</span>
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

      <div class="px-4 sm:px-6 py-5 space-y-3">
        <div
          v-for="(level, idx) in levels"
          :key="level.id"
          class="grid grid-cols-[80px_minmax(0,1fr)_120px] sm:grid-cols-[100px_minmax(0,1fr)_160px] items-center gap-3"
        >
          <div class="flex flex-col gap-0.5 font-mono text-[10px]">
            <span class="text-[11px] sm:text-xs" :class="level.accent">{{ level.label }}</span>
            <span class="text-dimmed text-[9px] tracking-widest uppercase">rate {{ level.rate }}%</span>
          </div>

          <div class="grid grid-cols-[repeat(25,minmax(0,1fr))] sm:grid-cols-[repeat(50,minmax(0,1fr))] gap-[3px] py-1">
            <span
              v-for="i in TOTAL_DOTS"
              :key="i"
              class="block size-1.5 rounded-full transition-all duration-200"
              :class="(revealed[idx] ?? 0) < i
                ? 'bg-muted/40'
                : (masks[idx]?.[i - 1] ? `${level.keptColor} shadow-[0_0_4px_color-mix(in_srgb,currentColor_60%,transparent)]` : level.droppedColor)"
            />
          </div>

          <div class="flex items-center justify-end gap-2 font-mono text-[10px]">
            <span class="inline-flex items-center gap-1" :class="level.accent">
              <UIcon name="i-lucide-check" class="size-3" />
              {{ totals[idx]?.kept ?? 0 }}
            </span>
            <span class="text-dimmed/70">·</span>
            <span class="inline-flex items-center gap-1 text-rose-400/80">
              <UIcon name="i-lucide-x" class="size-3" />
              {{ totals[idx]?.dropped ?? 0 }}
            </span>
          </div>
        </div>
      </div>

      <div class="border-t border-muted/50 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[10px] text-dimmed">
        <span class="inline-flex items-center gap-1.5">
          <span class="size-1.5 rounded-full bg-emerald-500" />
          kept
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="size-1.5 rounded-full bg-rose-400/50" />
          dropped
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="size-1.5 rounded-full bg-muted/60" />
          unevaluated
        </span>
        <span
          class="ml-auto transition-opacity duration-500"
          :class="allDone ? 'opacity-100 text-primary' : 'opacity-60'"
        >
          error defaults to 100% — set <span class="text-rose-300">error: 0</span> to override
        </span>
      </div>
    </div>
  </div>
</template>
