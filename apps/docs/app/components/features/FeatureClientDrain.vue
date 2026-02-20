<script setup lang="ts">
import { Motion } from 'motion-v'

const prefersReducedMotion = ref(false)

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})

const pills = [
  { label: 'Auto-batch', icon: 'i-lucide-layers' },
  { label: 'sendBeacon', icon: 'i-lucide-send' },
  { label: 'Origin validation', icon: 'i-lucide-shield-check' },
]
</script>

<template>
  <section class="py-24 md:py-32">
    <div class="grid gap-6 lg:grid-cols-2 *:min-w-0">
      <div class="flex flex-col gap-8">
        <Motion
          :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
          :in-view="{ opacity: 1, y: 0 }"
          :transition="{ duration: 0.5 }"
          :in-view-options="{ once: true }"
        >
          <div>
            <p class="section-label">
              Client Logs
            </p>
            <div class="relative mb-4">
              <h2 class="section-title">
                See the full picture<span class="text-primary">.</span>
              </h2>
              <div aria-hidden="true" class="absolute inset-0 section-title blur-xs animate-pulse">
                See the full picture<span class="text-primary">.</span>
              </div>
            </div>
            <p class="max-w-md text-sm leading-relaxed text-zinc-400">
              Capture browser events and drain them to your server. Automatic batching, retries, and page-aware flushing — same pipeline, client to server.
            </p>
            <div class="mt-5 flex flex-wrap gap-2">
              <span
                v-for="pill in pills"
                :key="pill.label"
                class="inline-flex items-center gap-1.5 border border-zinc-800 bg-zinc-900/50 px-3 py-1 font-mono text-[11px] text-zinc-400"
              >
                <UIcon :name="pill.icon" class="size-3 text-accent-blue" />
                {{ pill.label }}
              </span>
            </div>
            <NuxtLink to="/core-concepts/client-logging" class="mt-4 inline-flex items-center gap-1.5 font-mono text-xs text-zinc-500 hover:text-accent-blue transition-colors">
              Client logging guide
              <UIcon name="i-lucide-arrow-right" class="size-3" />
            </NuxtLink>
          </div>
        </Motion>

        <Motion
          :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
          :in-view="{ opacity: 1, y: 0 }"
          :transition="{ duration: 0.5, delay: 0.15 }"
          :in-view-options="{ once: true }"
        >
          <div class="space-y-5">
            <div class="flex items-start gap-3">
              <UIcon name="i-lucide-layers" class="size-4 mt-0.5 shrink-0 text-accent-blue" />
              <div>
                <p class="font-mono text-xs text-zinc-300">
                  Automatic batching
                </p>
                <p class="mt-1 text-xs leading-relaxed text-zinc-500">
                  Events are batched by size and time interval, reducing network overhead.
                </p>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <UIcon name="i-lucide-send" class="size-4 mt-0.5 shrink-0 text-accent-blue" />
              <div>
                <p class="font-mono text-xs text-zinc-300">
                  Page-aware delivery
                </p>
                <p class="mt-1 text-xs leading-relaxed text-zinc-500">
                  Switches to sendBeacon when the page is hidden. No event left behind.
                </p>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <UIcon name="i-lucide-shield-check" class="size-4 mt-0.5 shrink-0 text-accent-blue" />
              <div>
                <p class="font-mono text-xs text-zinc-300">
                  Server-side validation
                </p>
                <p class="mt-1 text-xs leading-relaxed text-zinc-500">
                  Origin check, payload sanitization, and source tagging on every ingest.
                </p>
              </div>
            </div>
          </div>
        </Motion>
      </div>

      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
        :in-view="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5, delay: 0.1 }"
        :in-view-options="{ once: true }"
      >
        <div class="overflow-hidden border border-zinc-800 bg-[#0c0c0e]">
          <div class="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <div class="flex gap-1.5">
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
            </div>
            <span class="ml-3 font-mono text-xs text-zinc-600">browser-drain.ts</span>
          </div>

          <div class="px-5 pt-5 pb-4 font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto">
            <!-- eslint-disable vue/multiline-html-element-content-newline -->
            <pre><code><span class="text-violet-400">import</span> { createBrowserLogDrain } <span class="text-violet-400">from</span> <span class="text-emerald-400">'evlog/browser'</span>

<span class="text-violet-400">const</span> drain = <span class="text-amber-400">createBrowserLogDrain</span>({
  <span class="text-sky-400">drain</span>: {
    <span class="text-sky-400">endpoint</span>: <span class="text-emerald-400">'/api/_evlog/ingest'</span>,
  },
  <span class="text-sky-400">pipeline</span>: {
    <span class="text-sky-400">batch</span>: { <span class="text-sky-400">size</span>: <span class="text-pink-400">25</span>, <span class="text-sky-400">intervalMs</span>: <span class="text-pink-400">2000</span> },
    <span class="text-sky-400">retry</span>: { <span class="text-sky-400">maxAttempts</span>: <span class="text-pink-400">2</span> },
  },
})

<span class="text-amber-400">initLogger</span>({ drain })</code></pre>
            <!-- eslint-enable -->
          </div>

          <!-- Flow diagram -->
          <div class="border-t border-zinc-800/50 px-4 sm:px-6 py-8 sm:py-10">
            <div class="flex items-start justify-between">
              <!-- Browser node -->
              <div class="flex flex-col items-center gap-2 shrink-0">
                <div class="border border-zinc-800 bg-[#0a0a0e] p-3">
                  <UIcon name="i-lucide-globe" class="size-5 text-accent-blue" />
                </div>
                <span class="font-mono text-[9px] text-zinc-400">Browser</span>
                <span class="font-mono text-[7px] tracking-widest text-zinc-600">EVENTS</span>
              </div>

              <!-- Connection 1 -->
              <div class="connection flex-1 self-[22px] mt-5 mx-2 sm:mx-3">
                <div class="h-px bg-zinc-800 relative overflow-hidden">
                  <div class="pulse-trail" />
                </div>
                <p class="mt-2 text-center font-mono text-[7px] tracking-wider text-zinc-600">
                  BATCH &middot; FLUSH
                </p>
              </div>

              <!-- Pipeline node -->
              <div class="flex flex-col items-center gap-2 shrink-0">
                <div class="relative border border-accent-blue/30 bg-[#0a0a0e] p-3">
                  <div class="flex items-center gap-1.5">
                    <span class="relative flex size-1.5">
                      <span class="absolute inline-flex size-full animate-ping bg-accent-blue/40" />
                      <span class="relative inline-flex size-1.5 bg-accent-blue" />
                    </span>
                    <UIcon name="i-lucide-layers" class="size-5 text-accent-blue" />
                  </div>
                </div>
                <span class="font-mono text-[9px] text-zinc-400">Pipeline</span>
                <span class="font-mono text-[7px] tracking-widest text-zinc-600">RETRY &middot; BACKOFF</span>
              </div>

              <!-- Connection 2 -->
              <div class="connection flex-1 self-[22px] mt-5 mx-2 sm:mx-3">
                <div class="h-px bg-zinc-800 relative overflow-hidden">
                  <div class="pulse-trail pulse-trail-delayed" />
                </div>
                <p class="mt-2 text-center font-mono text-[7px] tracking-wider text-zinc-600">
                  POST &middot; BEACON
                </p>
              </div>

              <!-- Server node -->
              <div class="flex flex-col items-center gap-2 shrink-0">
                <div class="border border-zinc-800 bg-[#0a0a0e] p-3">
                  <UIcon name="i-lucide-server" class="size-5 text-zinc-500" />
                </div>
                <span class="font-mono text-[9px] text-zinc-400">Server</span>
                <span class="font-mono text-[7px] tracking-widest text-zinc-600">VALIDATE &middot; DRAIN</span>
              </div>
            </div>

            <div class="mt-6 flex items-center justify-center gap-2">
              <UIcon name="i-lucide-eye-off" class="size-3 text-zinc-600" />
              <span class="font-mono text-[9px] text-zinc-600">auto-flush on page visibility change</span>
            </div>
          </div>
        </div>
      </Motion>
    </div>
  </section>
</template>

<style scoped>
.pulse-trail {
  position: absolute;
  top: -1px;
  height: 3px;
  width: 30%;
  background: linear-gradient(90deg, transparent, rgba(40, 83, 255, 0.6), transparent);
  animation: pulse-flow 2.5s ease-in-out infinite;
}

.pulse-trail-delayed {
  animation-delay: 0.8s;
}

@keyframes pulse-flow {
  0% { left: -30%; }
  100% { left: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .pulse-trail {
    animation: none;
    display: none;
  }
}
</style>
