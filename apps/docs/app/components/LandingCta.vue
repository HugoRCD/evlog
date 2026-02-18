<script setup lang="ts">
import { Motion } from 'motion-v'

const prefersReducedMotion = ref(false)

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})
</script>

<template>
  <UPageSection>
    <div class="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
        :in-view="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5 }"
        :in-view-options="{ once: true }"
      >
        <p class="section-label mb-4 font-pixel text-xs uppercase tracking-widest text-muted">
          Get Started
        </p>
        <h2 class="mb-6 section-title">
          Stop grep-ing through chaos<span class="text-primary">.</span>
        </h2>
        <p class="max-w-lg text-base text-muted mb-10 leading-relaxed">
          Wide events, structured errors, zero config.
          Ship with the logging your future self will thank you for.
        </p>

        <div class="flex flex-wrap items-center gap-4">
          <UButton
            to="/getting-started/installation"
            size="lg"
            class="bg-primary hover:bg-primary/90 text-white border-0"
          >
            Get Started
            <template #trailing>
              <UIcon name="i-lucide-arrow-right" class="size-4" />
            </template>
          </UButton>
          <UButton
            to="https://github.com/hugorcd/evlog"
            target="_blank"
            size="lg"
            variant="outline"
            color="neutral"
          >
            <template #leading>
              <UIcon name="i-simple-icons-github" class="size-4" />
            </template>
            View on GitHub
          </UButton>
        </div>
      </Motion>

      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
        :in-view="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5, delay: 0.1 }"
        :in-view-options="{ once: true }"
        class="hidden lg:block"
      >
        <div class="dark overflow-hidden border border-zinc-800 bg-[#0c0c0e]">
          <div class="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <div class="flex gap-1.5">
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
            </div>
            <span class="ml-3 font-mono text-xs text-zinc-600">terminal</span>
          </div>
          <div class="p-5 font-mono text-sm">
            <div class="flex items-center gap-2 text-zinc-500 mb-3">
              <span class="text-emerald-500">$</span>
              <span>bun add evlog</span>
            </div>
            <div class="text-zinc-600 mb-4">
              <span class="text-zinc-500">+ evlog@1.0.0</span>
            </div>
            <div class="flex items-center gap-2 text-zinc-500 mb-3">
              <span class="text-emerald-500">$</span>
              <span class="text-zinc-400">cat nuxt.config.ts</span>
            </div>
            <pre class="text-zinc-400"><code><span class="text-violet-400">export default</span> <span class="text-amber-400">defineNuxtConfig</span>({
  <span class="text-sky-400">modules</span>: [<span class="text-emerald-400">'evlog/nuxt'</span>],
})</code></pre>
            <div class="mt-4 pt-3 border-t border-zinc-800 text-zinc-600 text-xs">
              <span class="text-emerald-500">✓</span> Ready. No configuration needed.
            </div>
          </div>
        </div>
      </Motion>
    </div>
  </UPageSection>
</template>
