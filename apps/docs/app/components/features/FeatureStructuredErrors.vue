<script setup lang="ts">
import { Motion } from 'motion-v'

const prefersReducedMotion = ref(false)

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})

const pills = [
  { label: 'Root cause', icon: 'i-lucide-search' },
  { label: 'Fix suggestion', icon: 'i-lucide-wrench' },
  { label: 'AI-parseable', icon: 'i-lucide-bot' },
]
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
        <p class="section-label">Structured Errors</p>
        <div class="relative mb-5">
          <h2 class="section-title max-w-lg">
            Errors that explain why<span class="text-primary">.</span>
          </h2>
          <h2 aria-hidden="true" class="absolute inset-0 section-title max-w-lg blur-xs animate-pulse">
            Errors that explain why<span class="text-primary">.</span>
          </h2>
        </div>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="pill in pills"
            :key="pill.label"
            class="inline-flex items-center gap-1.5 border border-zinc-800 bg-zinc-900/50 px-3 py-1 font-mono text-[11px] text-zinc-400"
          >
            <UIcon :name="pill.icon" class="size-3 text-emerald-500" />
            {{ pill.label }}
          </span>
        </div>
      </div>
    </Motion>

    <div class="grid gap-6 lg:grid-cols-2">
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
            <span class="ml-3 font-mono text-xs text-zinc-600">payment.post.ts</span>
          </div>
          <div class="p-5 font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto">
            <pre><code><span class="text-violet-400">throw</span> <span class="text-amber-400">createError</span>({
  <span class="text-sky-400">message</span>: <span class="text-emerald-400">'Payment failed'</span>,
  <span class="text-sky-400">status</span>: <span class="text-pink-400">402</span>,
  <span class="text-sky-400">why</span>: <span class="text-emerald-400">'Card declined by issuer'</span>,
  <span class="text-sky-400">fix</span>: <span class="text-emerald-400">'Try a different card'</span>,
})</code></pre>
          </div>
        </div>
      </Motion>

      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
        :in-view="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5, delay: 0.2 }"
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
            <div class="space-y-1 border-l-2 border-red-500/30 pl-4">
              <div>
                <span class="text-sky-400">message</span><span class="text-zinc-600">:</span>
                <span class="text-zinc-400"> "Payment failed"</span>
              </div>
              <div>
                <span class="text-sky-400">why</span><span class="text-zinc-600">:</span>
                <span class="text-zinc-400"> "Card declined by issuer"</span>
              </div>
              <div>
                <span class="text-sky-400">fix</span><span class="text-zinc-600">:</span>
                <span class="text-emerald-400"> "Try a different card"</span>
              </div>
            </div>
            <div class="mt-4 border-t border-zinc-800 pt-3">
              <p class="text-xs text-zinc-500">
                <span class="text-emerald-500">&#10003;</span> Actionable error messages
              </p>
            </div>
          </div>
        </div>
      </Motion>
    </div>
  </section>
</template>
