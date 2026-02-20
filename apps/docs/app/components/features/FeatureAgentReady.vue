<script setup lang="ts">
import { Motion } from 'motion-v'

const prefersReducedMotion = ref(false)
const visibleSteps = ref(0)
const activeField = ref<string | null>(null)
const isComplete = ref(false)
const animationStarted = ref(false)
const rightPanelRef = ref<HTMLElement>()

interface Step {
  field: string
  label: string
  text: string
}

const steps: Step[] = [
  { field: 'why', label: 'Root cause', text: 'Card declined by issuer — insufficient funds' },
  { field: 'user', label: 'User impact', text: 'Pro plan user (#1842) blocked on payment' },
  { field: 'fix', label: 'Suggested fix', text: 'Prompt for alternate payment method' },
  { field: 'links', label: 'Documentation', text: 'stripe.com/docs/declines/codes' },
]

const pills = [
  { label: 'Structured context', icon: 'i-lucide-braces' },
  { label: 'Machine-parseable', icon: 'i-lucide-cpu' },
  { label: 'Actionable output', icon: 'i-lucide-sparkles' },
]

let timers: ReturnType<typeof setTimeout>[] = []
let observer: IntersectionObserver | undefined

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (prefersReducedMotion.value) {
    visibleSteps.value = steps.length
    isComplete.value = true
    return
  }

  if (rightPanelRef.value) {
    observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          startAnimation()
          observer?.disconnect()
        }
      },
      { threshold: 0.3 },
    )
    observer.observe(rightPanelRef.value)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  timers.forEach(clearTimeout)
})

function startAnimation() {
  if (animationStarted.value) return
  animationStarted.value = true

  steps.forEach((step, i) => {
    const delay = 600 + i * 800
    timers.push(setTimeout(() => {
      activeField.value = step.field
      visibleSteps.value = i + 1
    }, delay))
  })

  const finalDelay = 600 + steps.length * 800
  timers.push(setTimeout(() => {
    activeField.value = null
    isComplete.value = true
  }, finalDelay))
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
        <p class="section-label">Agent Ready</p>
        <div class="relative mb-5">
          <h2 class="section-title max-w-xl">
            Built for agents<span class="text-primary">.</span>
          </h2>
          <h2 aria-hidden="true" class="absolute inset-0 section-title max-w-xl blur-xs animate-pulse">
            Built for agents<span class="text-primary">.</span>
          </h2>
        </div>
        <p class="max-w-lg text-sm leading-relaxed text-zinc-400">
          Structured fields, machine-readable context, and actionable metadata — everything an AI agent needs to diagnose and resolve issues on its own.
        </p>
        <div class="mt-5 flex flex-wrap gap-2">
          <span
            v-for="pill in pills"
            :key="pill.label"
            class="inline-flex items-center gap-1.5 border border-zinc-800 bg-zinc-900/50 px-3 py-1 font-mono text-[11px] text-zinc-400"
          >
            <UIcon :name="pill.icon" class="size-3 text-violet-500" />
            {{ pill.label }}
          </span>
        </div>
      </div>
    </Motion>

    <div class="grid gap-6 lg:grid-cols-2">
      <!-- Left: Structured error output -->
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
            <span class="ml-3 font-mono text-xs text-zinc-600">output</span>
            <span class="ml-auto font-mono text-xs text-red-500">ERROR</span>
          </div>
          <div class="p-5 font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto">
            <div class="mb-3 flex items-baseline gap-3">
              <span class="font-medium text-red-500">ERROR</span>
              <span class="text-violet-400">POST</span>
              <span class="text-amber-400">/api/payment</span>
              <span class="ml-auto text-red-500">402</span>
            </div>
            <div class="space-y-0">
              <div
                class="border-l-2 py-0.5 pl-4 transition-all duration-300"
                :class="activeField === 'why' ? 'border-l-violet-500/60 bg-violet-500/[0.06]' : 'border-l-red-500/30'"
              >
                <span class="text-sky-400">message</span><span class="text-zinc-600">:</span>
                <span class="text-zinc-400"> "Payment processing failed"</span>
              </div>
              <div
                class="border-l-2 py-0.5 pl-4 transition-all duration-300"
                :class="activeField === 'why' ? 'border-l-violet-500/60 bg-violet-500/[0.06]' : 'border-l-red-500/30'"
              >
                <span class="text-sky-400">why</span><span class="text-zinc-600">:</span>
                <span class="text-zinc-400"> "Card issuer declined: insufficient funds"</span>
              </div>
              <div
                class="border-l-2 py-0.5 pl-4 transition-all duration-300"
                :class="activeField === 'fix' ? 'border-l-violet-500/60 bg-violet-500/[0.06]' : 'border-l-red-500/30'"
              >
                <span class="text-sky-400">fix</span><span class="text-zinc-600">:</span>
                <span class="text-emerald-400"> "Retry with a different payment method"</span>
              </div>
              <div
                class="border-l-2 py-0.5 pl-4 transition-all duration-300"
                :class="activeField === 'user' ? 'border-l-violet-500/60 bg-violet-500/[0.06]' : 'border-l-red-500/30'"
              >
                <span class="text-sky-400">user</span><span class="text-zinc-600">:</span>
                <span class="text-zinc-400"> { id: 1842, plan: "pro" }</span>
              </div>
              <div
                class="border-l-2 py-0.5 pl-4 transition-all duration-300"
                :class="activeField === 'links' ? 'border-l-violet-500/60 bg-violet-500/[0.06]' : 'border-l-red-500/30'"
              >
                <span class="text-sky-400">links</span><span class="text-zinc-600">:</span>
                <span class="text-zinc-400"> ["stripe.com/docs/declines"]</span>
              </div>
            </div>
          </div>
        </div>
      </Motion>

      <!-- Right: AI Agent Analysis -->
      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
        :in-view="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5, delay: 0.2 }"
        :in-view-options="{ once: true }"
      >
        <div ref="rightPanelRef" class="h-full overflow-hidden border border-zinc-800 bg-[#0c0c0e]">
          <div class="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <div class="flex gap-1.5">
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
            </div>
            <span class="ml-3 flex items-center gap-1.5 font-mono text-xs text-zinc-600">
              <UIcon name="i-lucide-bot" class="size-3 text-violet-500" />
              AI Agent
            </span>
            <span
              class="ml-auto flex items-center gap-1.5 font-mono text-xs transition-colors duration-300"
              :class="isComplete ? 'text-emerald-500' : 'text-violet-500'"
            >
              <span class="relative flex size-1.5">
                <span
                  v-if="!isComplete"
                  class="absolute inline-flex size-full animate-ping bg-violet-500/40"
                />
                <span
                  class="relative inline-flex size-1.5 transition-colors duration-300"
                  :class="isComplete ? 'bg-emerald-500' : 'bg-violet-500'"
                />
              </span>
              {{ isComplete ? 'done' : 'analyzing' }}
            </span>
          </div>
          <div class="p-5 font-mono text-xs sm:text-sm leading-relaxed">
            <div
              class="mb-4 text-xs transition-colors duration-300"
              :class="isComplete ? 'text-zinc-600' : 'text-zinc-500'"
            >
              {{ isComplete ? 'Analysis complete — 4 insights extracted' : 'Reading structured error context...' }}
            </div>

            <!-- All lines rendered upfront — no layout shift -->
            <div class="space-y-3">
              <div
                v-for="(step, i) in steps"
                :key="step.field"
                class="flex items-start gap-2 transition-all duration-300 ease-out"
                :class="i < visibleSteps ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-3'"
              >
                <span class="mt-px text-violet-500">→</span>
                <div>
                  <span class="text-zinc-300">{{ step.label }}</span>
                  <p class="text-zinc-500">{{ step.text }}</p>
                </div>
              </div>
            </div>

            <!-- Action line — always in DOM, opacity-controlled -->
            <div
              class="mt-4 border-t border-zinc-800 pt-3 transition-opacity duration-500"
              :class="isComplete ? 'opacity-100' : 'opacity-0'"
            >
              <p class="text-xs text-zinc-500">
                <span class="text-violet-500">&#10003;</span> Auto-created issue <span class="text-zinc-400">PAY-4521</span>
              </p>
            </div>
          </div>
        </div>
      </Motion>
    </div>
  </section>
</template>
