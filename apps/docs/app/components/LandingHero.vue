<script setup lang="ts">
import { Motion } from 'motion-v'

const prefersReducedMotion = ref(false)
const copied = ref(false)

async function copyCommand() {
  await navigator.clipboard.writeText('npx skills add hugorcd/evlog')
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 2000)
}

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})
</script>

<template>
  <section class="relative overflow-hidden bg-dark-bg">
    <div class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-white/4 rounded-full blur-3xl pointer-events-none" />
    <div class="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto pt-28 lg:pt-32 pb-4 px-6">
      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 16 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5 }"
      >
        <button
          class="mb-1 flex items-center gap-2 font-pixel-square text-xs px-4 py-1.5 rounded-full border border-dark-border bg-dark-surface/80 backdrop-blur-sm transition-all hover:border-accent-blue/50 cursor-copy"
          :class="copied ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'"
          @click="copyCommand"
        >
          <span v-if="copied">Copied!</span>
          <span v-else class="flex items-center gap-2">
            <span class="text-accent-blue">$</span>
            npx skills add hugorcd/evlog
          </span>
        </button>
      </Motion>

      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 16 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5, delay: 0.08 }"
      >
        <div class="relative">
          <h1 class="section-title mb-5 leading-[1.1]">
            Stop grepping<br>through chaos<span class="text-accent-blue">.</span>
          </h1>
          <h1 aria-hidden="true" class="absolute inset-0 section-title mb-5 leading-[1.1] blur-xs animate-pulse">
            Stop grepping<br>through chaos<span class="text-accent-blue">.</span>
          </h1>
        </div>
      </Motion>

      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 16 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5, delay: 0.16 }"
      >
        <p class="mb-8 max-w-xl text-base/7 text-zinc-400 font-sans">
          Wide events and structured errors for TypeScript. One log per request,
          full context, errors that explain why and how to fix.
        </p>
      </Motion>

      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 16 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5, delay: 0.24 }"
      >
        <div class="flex flex-wrap justify-center items-center gap-4">
          <UButton
            to="/getting-started/installation"
            size="xl"
            class="bg-accent-blue hover:bg-blue-600 text-white font-medium px-8"
            trailing-icon="i-lucide-arrow-right"
            label="Get Started"
          />
          <UButton
            to="https://github.com/hugorcd/evlog"
            target="_blank"
            size="xl"
            variant="outline"
            class="text-zinc-300 border-zinc-800 hover:bg-zinc-900 hover:border-zinc-700 hover:text-white"
            label="GitHub"
            leading-icon="i-simple-icons-github"
          />
        </div>
      </Motion>
    </div>

    <Motion
      :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 24 }"
      :animate="{ opacity: 1, y: 0 }"
      :transition="{ duration: 0.7, delay: 0.4, ease: 'easeOut' }"
      class="relative z-10 mt-16 pb-24"
    >
      <HeroTerminalDemo />
    </Motion>
  </section>
</template>
