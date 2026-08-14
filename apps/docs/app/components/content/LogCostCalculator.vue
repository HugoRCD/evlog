<script setup lang="ts">
import NumberFlow from '@number-flow/vue'
import { Motion } from 'motion-v'

interface Provider {
  id: string
  name: string
  perGb: number
  perMillionIndexed: number
  note: string
}

/**
 * Published list rates, in USD, as read on the date in `PRICES_READ_ON`. They
 * are starting points the reader overwrites: every rate in the panel is an
 * input, so a stale figure costs a correction rather than a wrong answer.
 */
const PRICES_READ_ON = '14 August 2026'
const PROVIDERS: Provider[] = [
  { id: 'datadog', name: 'Datadog', perGb: 0.10, perMillionIndexed: 1.70, note: 'ingest + indexing, 15-day retention' },
  { id: 'grafana', name: 'Grafana Cloud', perGb: 0.50, perMillionIndexed: 0, note: 'Loki ingest' },
  { id: 'sentry', name: 'Sentry', perGb: 0.50, perMillionIndexed: 0, note: 'beyond the 5 GB included' },
  { id: 'posthog', name: 'PostHog', perGb: 0.25, perMillionIndexed: 0, note: '50-300 GB tier' },
  { id: 'betterstack', name: 'Better Stack', perGb: 0.15, perMillionIndexed: 0, note: 'ingest, before retention' },
  { id: 'axiom', name: 'Axiom', perGb: 0.12, perMillionIndexed: 0, note: 'credits per GB loaded' },
]

/**
 * Bytes of serialized JSON per shape, measured by running the checkout request
 * documented on this page through pino 10 and evlog: 4 lines of 736 bytes
 * total against 1 event of 322 bytes. The line figure is the mean of the four.
 */
const PINO_LINE_BYTES = 184
const EVLOG_EVENT_BYTES = 322

const REQUEST_STEPS = [1e5, 3e5, 1e6, 3e6, 1e7, 3e7, 1e8, 3e8, 1e9]

const provider = ref<Provider>(PROVIDERS[0]!)
const perGb = ref(PROVIDERS[0]!.perGb)
const perMillionIndexed = ref(PROVIDERS[0]!.perMillionIndexed)
const requestStep = ref(4)
const linesPerRequest = ref(4)
const sampled = ref(false)
const sound = ref(false)

const requests = computed(() => REQUEST_STEPS[requestStep.value] ?? 1e7)
/** Head sampling keeps every error and a tenth of the successful requests. */
const keptRatio = computed(() => sampled.value ? 0.145 : 1)

const before = computed(() => {
  const events = requests.value * linesPerRequest.value
  const bytes = events * PINO_LINE_BYTES
  return { events, gb: bytes / 1e9 }
})
const after = computed(() => {
  const events = requests.value * keptRatio.value
  const bytes = events * EVLOG_EVENT_BYTES
  return { events, gb: bytes / 1e9 }
})

function bill(shape: { events: number, gb: number }) {
  return shape.gb * perGb.value + (shape.events / 1e6) * perMillionIndexed.value
}
const beforeCost = computed(() => bill(before.value))
const afterCost = computed(() => bill(after.value))
const saved = computed(() => Math.max(0, beforeCost.value - afterCost.value))
const savedPct = computed(() => beforeCost.value === 0 ? 0 : saved.value / beforeCost.value)
/** Width of the "after" bar against the "before" bar, floored so it stays visible. */
const afterWidth = computed(() => `${Math.max(2, (afterCost.value / (beforeCost.value || 1)) * 100)}%`)

function selectProvider(next: Provider) {
  provider.value = next
  perGb.value = next.perGb
  perMillionIndexed.value = next.perMillionIndexed
  tick()
}

let audio: AudioContext | undefined
function tick() {
  if (!sound.value || typeof window === 'undefined') return
  audio ||= new AudioContext()
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.frequency.value = 880
  gain.gain.setValueAtTime(0.04, audio.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.06)
  osc.connect(gain).connect(audio.destination)
  osc.start()
  osc.stop(audio.currentTime + 0.06)
}

const compact = { notation: 'compact' as const, maximumFractionDigits: 1 }
const percent = { style: 'percent' as const, maximumFractionDigits: 0 }
/** Cents below $100, where rounding to whole dollars would stop the row adding up. */
const money = computed(() => ({
  style: 'currency' as const,
  currency: 'USD',
  maximumFractionDigits: beforeCost.value < 100 ? 2 : 0,
}))
</script>

<template>
  <Motion
    :initial="false"
    :while-in-view="{ opacity: 1, y: 0 }"
    :transition="{ duration: 0.4 }"
    :in-view-options="{ once: true }"
    class="not-prose my-8"
    data-section="log-cost-calculator"
  >
    <div class="overflow-hidden rounded-lg border border-muted bg-default">
      <div class="flex items-center gap-2 border-b border-muted px-4 py-2">
        <span class="font-mono text-[10px] uppercase tracking-widest text-dimmed">Monthly log bill</span>
        <span class="ml-auto flex items-center gap-2">
          <button
            type="button"
            class="text-dimmed transition-colors hover:text-default"
            :aria-pressed="sound"
            :aria-label="sound ? 'Mute interaction sound' : 'Unmute interaction sound'"
            @click="sound = !sound; tick()"
          >
            <UIcon :name="sound ? 'i-lucide-volume-2' : 'i-lucide-volume-off'" class="size-3.5" />
          </button>
        </span>
      </div>

      <div class="space-y-3 px-4 py-3">
        <div class="flex flex-wrap gap-1">
          <button
            v-for="p in PROVIDERS"
            :key="p.id"
            type="button"
            class="border px-2 py-1 font-mono text-[10px] transition-colors"
            :class="provider.id === p.id
              ? 'border-primary/60 bg-primary/10 text-highlighted'
              : 'border-muted bg-elevated/40 text-muted hover:text-default'"
            @click="selectProvider(p)"
          >
            {{ p.name }}
          </button>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="font-mono text-[9px] uppercase tracking-widest text-dimmed">Requests / month</span>
            <input
              v-model.number="requestStep"
              type="range"
              min="0"
              :max="REQUEST_STEPS.length - 1"
              step="1"
              class="mt-1 w-full accent-primary"
              @input="tick"
            >
            <span class="font-mono text-[11px] text-highlighted tabular-nums">
              <NumberFlow :value="requests" :format="compact" />
            </span>
          </label>

          <label class="block">
            <span class="font-mono text-[9px] uppercase tracking-widest text-dimmed">Log lines per request, before</span>
            <input
              v-model.number="linesPerRequest"
              type="range"
              min="2"
              max="10"
              step="1"
              class="mt-1 w-full accent-primary"
              @input="tick"
            >
            <span class="font-mono text-[11px] text-highlighted tabular-nums">{{ linesPerRequest }} lines</span>
          </label>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="flex items-center gap-2">
            <span class="font-mono text-[9px] uppercase tracking-widest text-dimmed">$ / GB</span>
            <input
              v-model.number="perGb"
              type="number"
              min="0"
              step="0.01"
              class="w-20 border border-muted bg-elevated/40 px-1.5 py-0.5 font-mono text-[11px] text-highlighted tabular-nums"
            >
          </label>
          <label class="flex items-center gap-2">
            <span class="font-mono text-[9px] uppercase tracking-widest text-dimmed">$ / M indexed</span>
            <input
              v-model.number="perMillionIndexed"
              type="number"
              min="0"
              step="0.01"
              class="w-20 border border-muted bg-elevated/40 px-1.5 py-0.5 font-mono text-[11px] text-highlighted tabular-nums"
            >
          </label>
        </div>

        <label class="flex items-center gap-2 font-mono text-[10px] text-muted">
          <input v-model="sampled" type="checkbox" class="accent-primary" @change="tick">
          Head sampling on, keeping every error and 10% of successes
        </label>
      </div>

      <div class="border-t border-muted px-4 py-3">
        <div class="grid grid-cols-3 gap-2 font-mono text-[9px] uppercase tracking-widest text-dimmed">
          <span />
          <span>{{ linesPerRequest }} lines / request</span>
          <span class="text-primary">evlog, 1 event</span>
        </div>

        <div class="mt-1.5 grid grid-cols-3 items-baseline gap-2 font-mono text-[11px] tabular-nums">
          <span class="text-dimmed">Events</span>
          <span class="text-muted"><NumberFlow :value="before.events" :format="compact" /></span>
          <span class="text-highlighted"><NumberFlow :value="after.events" :format="compact" /></span>
        </div>
        <div class="mt-1 grid grid-cols-3 items-baseline gap-2 font-mono text-[11px] tabular-nums">
          <span class="text-dimmed">Data</span>
          <span class="text-muted"><NumberFlow :value="before.gb" :format="compact" suffix=" GB" /></span>
          <span class="text-highlighted"><NumberFlow :value="after.gb" :format="compact" suffix=" GB" /></span>
        </div>
        <div class="mt-1 grid grid-cols-3 items-baseline gap-2 font-mono text-[13px] tabular-nums">
          <span class="text-dimmed text-[11px]">Cost</span>
          <span class="text-muted"><NumberFlow :value="beforeCost" :format="money" /></span>
          <span class="text-highlighted"><NumberFlow :value="afterCost" :format="money" /></span>
        </div>

        <div class="mt-3 space-y-1">
          <div class="flex items-center gap-2">
            <span class="w-10 shrink-0 font-mono text-[9px] uppercase tracking-widest text-dimmed">before</span>
            <div class="h-1.5 w-full rounded-full bg-muted" />
          </div>
          <div class="flex items-center gap-2">
            <span class="w-10 shrink-0 font-mono text-[9px] uppercase tracking-widest text-primary">after</span>
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
              <div class="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" :style="{ width: afterWidth }" />
            </div>
          </div>
        </div>

        <p class="mt-2 font-mono text-[11px] tabular-nums text-highlighted">
          <NumberFlow :value="saved" :format="money" /> saved per month
          <span class="text-dimmed">(<NumberFlow :value="savedPct" :format="percent" /> less)</span>
        </p>
      </div>

      <div class="border-t border-muted bg-elevated/30 px-4 py-2.5 font-mono text-[9px] leading-relaxed text-dimmed">
        <p>
          Byte counts measured by serializing the checkout request above through pino 10 and evlog:
          4 lines totalling 736 B against 1 event of 322 B, so {{ PINO_LINE_BYTES }} B per line and
          {{ EVLOG_EVENT_BYTES }} B per event. Your fields differ, so treat the shape as the method, not the answer.
        </p>
        <p class="mt-1">
          List rates read on {{ PRICES_READ_ON }} ({{ provider.name }}: {{ provider.note }}). Vendors change
          pricing without notice, which is why every rate here is editable. Free tiers, committed-use discounts
          and retention add-ons are not modelled. Sampling assumes a 5% error rate: every error kept, plus a
          tenth of the successes.
        </p>
      </div>
    </div>
  </Motion>
</template>
