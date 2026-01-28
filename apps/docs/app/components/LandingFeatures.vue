<script setup lang="ts">
import { Motion } from 'motion-v'

const prefersReducedMotion = ref(false)

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})

const features = [
  {
    title: 'Wide Events',
    description: 'Accumulate context throughout your request. Emit once at the end with everything you need.',
    code: `log.set({ user: { id, plan } })
log.set({ cart: { items, total } })
// → One event with all context`,
  },
  {
    title: 'Structured Errors',
    description: 'Errors that explain why they happened and how to fix them.',
    code: `throw createError({
  message: 'Payment failed',
  why: 'Card declined',
  fix: 'Try another card',
})`,
  },
  {
    title: 'Agent-Ready',
    description: 'Structured JSON output that AI agents can parse and understand.',
    code: `{
  "level": "error",
  "why": "Card declined",
  "fix": "Try another card"
}`,
  },
  {
    title: 'Nuxt & Nitro',
    description: 'First-class integration. Auto-create loggers, auto-emit at request end.',
    code: `export default defineNuxtConfig({
  modules: ['evlog/nuxt'],
})`,
  },
  {
    title: 'Smart Sampling',
    description: 'Head and tail sampling. Keep errors and slow requests, reduce noise.',
    code: `sampling: {
  rates: { info: 10, warn: 50 },
  keep: [{ status: 400 }]
}`,
  },
  {
    title: 'Pretty & JSON',
    description: 'Human-readable in dev, machine-parseable JSON in production.',
    code: `[INFO] POST /api/checkout (234ms)
  user: { id: 1, plan: "pro" }
  cart: { items: 3 }`,
  },
]
</script>

<template>
  <section class="bg-[#09090b] py-24 lg:py-32">
    <div class="mx-auto w-full max-w-6xl px-6">
      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
        :in-view="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5 }"
        :in-view-options="{ once: true }"
        class="mb-12"
      >
        <p class="section-label mb-4 font-mono text-xs uppercase tracking-widest text-zinc-500">
          Features
        </p>
        <h2 class="editorial-title text-3xl font-bold text-white md:text-4xl">
          Everything you need<span class="evlog-dot">.</span>
        </h2>
      </Motion>

      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Motion
          v-for="(feature, index) in features"
          :key="feature.title"
          :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 16 }"
          :in-view="{ opacity: 1, y: 0 }"
          :transition="{ duration: 0.4, delay: index * 0.05 }"
          :in-view-options="{ once: true }"
        >
          <div class="group h-full border border-zinc-800 bg-[#0c0c0e] p-5 transition-colors duration-300 hover:border-zinc-700">
            <h3 class="mb-2 font-mono font-semibold text-evlog-blue">
              {{ feature.title }}
            </h3>
            <p class="mb-4 text-sm leading-relaxed text-zinc-500">
              {{ feature.description }}
            </p>
            <div class="overflow-hidden border border-zinc-800 bg-[#09090b] p-3 transition-colors duration-300 group-hover:border-zinc-700">
              <pre class="font-mono text-[11px] leading-relaxed text-zinc-500 transition-colors duration-300 group-hover:text-zinc-400">{{ feature.code }}</pre>
            </div>
          </div>
        </Motion>
      </div>
    </div>
  </section>
</template>
