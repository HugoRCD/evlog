<script setup lang="ts">
import { Motion } from 'motion-v'

const prefersReducedMotion = ref(false)

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})
</script>

<template>
  <section class="relative py-32">
    <div class="editorial-separator mx-auto mb-24 max-w-md" />

    <div class="mx-auto max-w-4xl px-6 text-center">
      <Motion
        :initial="prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }"
        :in-view="{ opacity: 1, y: 0 }"
        :transition="{ duration: prefersReducedMotion ? 0 : 0.5 }"
        :in-view-options="{ once: true }"
      >
        <h2 class="editorial-title mb-6 text-3xl font-bold text-highlighted md:text-5xl text-balance">
          Ready to fix your logging<span class="evlog-dot">?</span>
        </h2>
        <p class="mx-auto mb-10 max-w-xl text-lg text-muted text-pretty">
          Stop grep-ing through scattered logs. Start shipping with confidence.
          Wide events, structured errors, zero config.
        </p>
      </Motion>

      <Motion
        :initial="prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }"
        :in-view="{ opacity: 1, y: 0 }"
        :transition="{ duration: prefersReducedMotion ? 0 : 0.5, delay: prefersReducedMotion ? 0 : 0.1 }"
        :in-view-options="{ once: true }"
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
    </div>
  </section>
</template>
