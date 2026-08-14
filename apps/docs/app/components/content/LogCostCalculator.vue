<script setup lang="ts">
import NumberFlow from '@number-flow/vue'
import { Motion } from 'motion-v'

interface Provider {
  id: string
  name: string
  icon: string
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
  { id: 'datadog', name: 'Datadog', icon: 'i-simple-icons-datadog', perGb: 0.10, perMillionIndexed: 1.70, note: 'ingest + indexing, 15-day retention' },
  { id: 'grafana', name: 'Grafana', icon: 'i-simple-icons-grafana', perGb: 0.50, perMillionIndexed: 0, note: 'Loki ingest' },
  { id: 'sentry', name: 'Sentry', icon: 'i-simple-icons-sentry', perGb: 0.50, perMillionIndexed: 0, note: 'beyond the 5 GB included' },
  { id: 'posthog', name: 'PostHog', icon: 'i-simple-icons-posthog', perGb: 0.25, perMillionIndexed: 0, note: '50-300 GB tier' },
  { id: 'betterstack', name: 'Better Stack', icon: 'i-simple-icons-betterstack', perGb: 0.15, perMillionIndexed: 0, note: 'ingest, before retention' },
  { id: 'axiom', name: 'Axiom', icon: 'i-custom-axiom', perGb: 0.12, perMillionIndexed: 0, note: 'credits per GB loaded' },
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
  return { events, gb: events * PINO_LINE_BYTES / 1e9 }
})
const after = computed(() => {
  const events = requests.value * keptRatio.value
  return { events, gb: events * EVLOG_EVENT_BYTES / 1e9 }
})

function bill(shape: { events: number, gb: number }) {
  return shape.gb * perGb.value + (shape.events / 1e6) * perMillionIndexed.value
}
/**
 * Costs are rounded to the precision they are displayed at before the saving
 * is taken from them, so the three figures on screen add up. Subtracting the
 * raw floats and rounding afterwards leaves the reader a cent short.
 */
const cents = computed(() => bill(before.value) < 100 ? 2 : 0)
function round(value: number) {
  const factor = 10 ** cents.value
  return Math.round(value * factor) / factor
}
const beforeCost = computed(() => round(bill(before.value)))
const afterCost = computed(() => round(bill(after.value)))
const saved = computed(() => Math.max(0, beforeCost.value - afterCost.value))
const savedPct = computed(() => beforeCost.value === 0 ? 0 : saved.value / beforeCost.value)
/** Floored so the shorter bar stays visible at extreme ratios. */
const afterWidth = computed(() => `${Math.max(3, (afterCost.value / (beforeCost.value || 1)) * 100)}%`)

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
/** Cents below $100, where rounding to whole dollars would stop the rows adding up. */
const money = computed(() => ({
  style: 'currency' as const,
  currency: 'USD',
  minimumFractionDigits: cents.value,
  maximumFractionDigits: cents.value,
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
        <button
          type="button"
          class="ml-auto text-dimmed transition-colors hover:text-default"
          :aria-pressed="sound"
          :aria-label="sound ? 'Mute interaction sound' : 'Unmute interaction sound'"
          @click="sound = !sound; tick()"
        >
          <UIcon :name="sound ? 'i-lucide-volume-2' : 'i-lucide-volume-off'" class="size-3.5" />
        </button>
      </div>

      <div class="space-y-3 border-b border-muted px-4 py-3">
        <div class="flex flex-wrap gap-1">
          <UButton
            v-for="p in PROVIDERS"
            :key="p.id"
            :icon="p.icon"
            :label="p.name"
            size="xs"
            :color="provider.id === p.id ? 'primary' : 'neutral'"
            :variant="provider.id === p.id ? 'subtle' : 'ghost'"
            :ui="{ label: 'font-mono text-[10px]' }"
            @click="selectProvider(p)"
          />
        </div>

        <div class="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <div>
            <p class="flex items-baseline justify-between font-mono text-[9px] uppercase tracking-widest text-dimmed">
              Requests / month
              <span class="text-[11px] normal-case tracking-normal text-highlighted tabular-nums">
                <NumberFlow :value="requests" :format="compact" />
              </span>
            </p>
            <USlider
              v-model="requestStep"
              :min="0"
              :max="REQUEST_STEPS.length - 1"
              :step="1"
              size="xs"
              class="mt-2"
              @update:model-value="tick"
            />
          </div>

          <div>
            <p class="flex items-baseline justify-between font-mono text-[9px] uppercase tracking-widest text-dimmed">
              Log lines per request, today
              <span class="text-[11px] normal-case tracking-normal text-highlighted tabular-nums">{{ linesPerRequest }}</span>
            </p>
            <USlider
              v-model="linesPerRequest"
              :min="2"
              :max="10"
              :step="1"
              size="xs"
              class="mt-2"
              @update:model-value="tick"
            />
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div class="flex items-center gap-1.5">
            <span class="font-mono text-[9px] uppercase tracking-widest text-dimmed">$ / GB</span>
            <UInputNumber
              v-model="perGb"
              :min="0"
              :step="0.01"
              size="xs"
              orientation="vertical"
              :ui="{ base: 'w-20 font-mono text-[11px] tabular-nums' }"
            />
          </div>
          <div class="flex items-center gap-1.5">
            <span class="font-mono text-[9px] uppercase tracking-widest text-dimmed">$ / M indexed</span>
            <UInputNumber
              v-model="perMillionIndexed"
              :min="0"
              :step="0.01"
              size="xs"
              orientation="vertical"
              :ui="{ base: 'w-20 font-mono text-[11px] tabular-nums' }"
            />
          </div>
          <USwitch
            v-model="sampled"
            size="xs"
            label="Sampling"
            class="ml-auto"
            :ui="{ label: 'font-mono text-[10px] text-muted' }"
            @update:model-value="tick"
          />
        </div>
      </div>

      <div class="border-b border-muted bg-emerald-500/[0.06] px-4 py-4 text-center">
        <p class="font-mono text-[9px] uppercase tracking-widest text-emerald-500/70">
          You save
        </p>
        <p class="mt-1 font-mono text-[32px] leading-none text-emerald-400 tabular-nums">
          <NumberFlow :value="saved" :format="money" />
        </p>
        <p class="mt-1.5 font-mono text-[10px] text-muted">
          every month, <span class="text-emerald-400"><NumberFlow :value="savedPct" :format="percent" /> less</span>
          than {{ linesPerRequest }} lines per request
        </p>
      </div>

      <div class="grid grid-cols-2 divide-x divide-muted border-b border-muted">
        <div class="space-y-2 bg-elevated/20 px-4 py-3">
          <p class="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-dimmed">
            <UIcon name="i-lucide-layers" class="size-3" />
            {{ linesPerRequest }} lines / request
          </p>
          <p class="font-mono text-[20px] leading-none text-muted tabular-nums">
            <NumberFlow :value="beforeCost" :format="money" />
          </p>
          <div class="h-1 rounded-full bg-muted" />
          <dl class="space-y-0.5 font-mono text-[10px] tabular-nums">
            <div class="flex justify-between">
              <dt class="text-dimmed">
                Events
              </dt><dd class="text-muted">
                <NumberFlow :value="before.events" :format="compact" />
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-dimmed">
                Data
              </dt><dd class="text-muted">
                <NumberFlow :value="before.gb" :format="compact" suffix=" GB" />
              </dd>
            </div>
          </dl>
        </div>

        <div class="space-y-2 bg-primary/[0.05] px-4 py-3">
          <p class="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-primary">
            <UIcon name="i-lucide-zap" class="size-3" />
            evlog, 1 event
          </p>
          <p class="font-mono text-[20px] leading-none text-highlighted tabular-nums">
            <NumberFlow :value="afterCost" :format="money" />
          </p>
          <div class="h-1 rounded-full bg-elevated">
            <div class="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" :style="{ width: afterWidth }" />
          </div>
          <dl class="space-y-0.5 font-mono text-[10px] tabular-nums">
            <div class="flex justify-between">
              <dt class="text-dimmed">
                Events
              </dt><dd class="text-highlighted">
                <NumberFlow :value="after.events" :format="compact" />
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-dimmed">
                Data
              </dt><dd class="text-highlighted">
                <NumberFlow :value="after.gb" :format="compact" suffix=" GB" />
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div class="bg-elevated/30 px-4 py-2.5 font-mono text-[9px] leading-relaxed text-dimmed">
        <p>
          Byte counts measured by serializing the checkout request above through pino 10 and evlog:
          4 lines totalling 736 B against 1 event of 322 B, so {{ PINO_LINE_BYTES }} B per line and
          {{ EVLOG_EVENT_BYTES }} B per event. Your fields differ, so treat the shape as the method, not the answer.
        </p>
        <p class="mt-1">
          List rates read on {{ PRICES_READ_ON }} ({{ provider.name }}: {{ provider.note }}). Vendors change
          pricing without notice, which is why every rate here is editable. Free tiers, committed-use discounts
          and retention add-ons are not modelled. Sampling keeps every error and a tenth of the successes,
          assuming a 5% error rate.
        </p>
      </div>
    </div>
  </Motion>
</template>
