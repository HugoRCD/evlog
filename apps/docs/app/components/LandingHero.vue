<script setup lang="ts">
import { Motion } from 'motion-v'

const prefersReducedMotion = ref(false)

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})
</script>

<template>
  <section class="relative min-h-dvh flex items-center justify-center overflow-hidden bg-zinc-50 dark:bg-zinc-950">
    <div class="hero-grid absolute inset-0 opacity-40" />

    <HeroLogs />

    <div class="pointer-events-none absolute inset-0">
      <div class="absolute left-6 top-20 size-8 border-l border-t border-zinc-200 dark:border-zinc-800" />
      <div class="absolute right-6 top-20 size-8 border-r border-t border-zinc-200 dark:border-zinc-800" />
      <div class="absolute bottom-6 left-6 size-8 border-b border-l border-zinc-200 dark:border-zinc-800" />
      <div class="absolute bottom-6 right-6 size-8 border-b border-r border-zinc-200 dark:border-zinc-800" />
    </div>

    <div class="relative z-10 mx-auto max-w-4xl px-6 py-24 text-center">
      <Motion
        :initial="prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ duration: prefersReducedMotion ? 0 : 0.6 }"
      >
        <p class="mb-8 text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
          Wide Events & Structured Errors
        </p>
      </Motion>

      <Motion
        :initial="prefersReducedMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }"
        :animate="{ opacity: 1, scale: 1 }"
        :transition="{ duration: prefersReducedMotion ? 0 : 0.8, delay: prefersReducedMotion ? 0 : 0.1 }"
      >
        <h1 class="editorial-title mb-10 text-5xl font-bold text-zinc-900 dark:text-white sm:text-6xl md:text-8xl text-balance">
          Logging that<br>
          makes sense<span class="text-evlog-blue">.</span>
        </h1>
      </Motion>

      <Motion
        :initial="prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ duration: prefersReducedMotion ? 0 : 0.6, delay: prefersReducedMotion ? 0 : 0.3 }"
      >
        <p class="mx-auto mb-14 max-w-xl text-lg text-zinc-600 dark:text-zinc-400 md:text-xl text-pretty">
          A TypeScript logging library that replaces scattered log lines with comprehensive wide events.
          One log per request, containing everything you need.
        </p>
      </Motion>

      <Motion
        :initial="prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ duration: prefersReducedMotion ? 0 : 0.6, delay: prefersReducedMotion ? 0 : 0.5 }"
        class="flex flex-col items-center justify-center gap-4 sm:flex-row"
      >
        <UButton
          to="/getting-started/introduction"
          size="xl"
          color="neutral"
          trailing-icon="i-lucide-arrow-right"
        >
          Get Started
        </UButton>
        <UButton
          to="https://github.com/hugorcd/evlog"
          target="_blank"
          size="xl"
          color="neutral"
          variant="outline"
          icon="i-simple-icons-github"
        >
          Star on GitHub
        </UButton>
      </Motion>

      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }"
        :animate="{ opacity: 1 }"
        :transition="{ duration: prefersReducedMotion ? 0 : 1, delay: prefersReducedMotion ? 0 : 0.8 }"
        class="mt-20"
      >
        <a href="#problem" class="group inline-flex flex-col items-center gap-2 text-zinc-400 transition-colors hover:text-zinc-900 dark:hover:text-white">
          <span class="text-xs uppercase tracking-widest">Scroll</span>
          <UIcon name="i-lucide-chevron-down" :class="['size-4', prefersReducedMotion ? '' : 'animate-bounce']" />
        </a>
      </Motion>
    </div>
  </section>
</template>
