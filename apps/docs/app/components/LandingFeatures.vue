<script setup lang="ts">
import { Motion } from 'motion-v'

const prefersReducedMotion = ref(false)

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})

const features = [
  {
    icon: 'i-lucide-layers',
    title: 'Wide Events',
    description: 'One comprehensive log per request containing all context. No more scattered logs—just signal, no noise.',
  },
  {
    icon: 'i-lucide-shield-alert',
    title: 'Structured Errors',
    description: 'Errors with why, fix, and link fields. Actionable context for debugging and resolution.',
  },
  {
    icon: 'i-lucide-bot',
    title: 'Agent-Ready Logs',
    description: 'Structured output that AI agents can parse and understand. Perfect for agentic debugging and automated issue resolution.',
  },
  {
    icon: 'i-lucide-zap',
    title: 'Nuxt & Nitro Ready',
    description: 'First-class integration with Nuxt and Nitro. Auto-create loggers, auto-emit at request end.',
  },
  {
    icon: 'i-lucide-filter',
    title: 'Smart Sampling',
    description: 'Head and tail sampling strategies. Keep errors, slow requests, and critical paths while reducing volume.',
  },
  {
    icon: 'i-lucide-palette',
    title: 'Pretty for Dev, JSON for Prod',
    description: 'Human-readable logs in development, machine-parseable JSON in production.',
  },
]
</script>

<template>
  <section id="features" class="relative py-32">
    <div class="editorial-separator mx-auto mb-24 max-w-md" />

    <div class="mx-auto max-w-5xl px-6">
      <Motion
        :initial="prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }"
        :in-view="{ opacity: 1, y: 0 }"
        :transition="{ duration: prefersReducedMotion ? 0 : 0.5 }"
        :in-view-options="{ once: true }"
        class="mb-20 text-center"
      >
        <h2 class="editorial-title mb-6 text-4xl font-bold text-highlighted md:text-5xl text-balance">
          Why evlog<span class="evlog-dot">.</span>
        </h2>
        <p class="mx-auto max-w-xl text-lg text-muted text-pretty">
          Traditional logging is broken. Your logs are scattered, each request generates 10+ log lines,
          and when something goes wrong, you're grep-ing through noise hoping to find signal.
        </p>
      </Motion>

      <div class="grid gap-x-16 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
        <Motion
          v-for="(feature, index) in features"
          :key="feature.title"
          :initial="prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }"
          :in-view="{ opacity: 1, y: 0 }"
          :transition="{ duration: prefersReducedMotion ? 0 : 0.4, delay: prefersReducedMotion ? 0 : index * 0.08 }"
          :in-view-options="{ once: true }"
          class="group"
        >
          <div class="relative">
            <div class="mb-6 flex items-center gap-4">
              <div class="flex size-11 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 transition-all duration-300 group-hover:border-evlog-blue/40 group-hover:bg-evlog-blue/5 dark:border-zinc-800 dark:bg-zinc-900">
                <UIcon
                  :name="feature.icon"
                  class="size-5 text-zinc-500 transition-colors duration-300 group-hover:text-evlog-blue dark:text-zinc-500"
                />
              </div>
              <div class="h-px flex-1 bg-zinc-200 transition-colors duration-300 group-hover:bg-evlog-blue/30 dark:bg-zinc-800" />
            </div>

            <h3 class="mb-3 text-xl font-bold tracking-tight text-highlighted">
              {{ feature.title }}
            </h3>

            <p class="text-sm leading-relaxed text-muted">
              {{ feature.description }}
            </p>
          </div>
        </Motion>
      </div>
    </div>
  </section>
</template>
