<script setup lang="ts">
import { Motion } from 'motion-v'

const prefersReducedMotion = ref(false)
const panelRef = ref<HTMLElement>()
const animStarted = ref(false)

const props = defineProps<{
  link?: string
  linkLabel?: string
}>()

const pills = [
  { label: 'Zero-alloc hot path', icon: 'i-lucide-zap' },
  { label: 'CodSpeed CI', icon: 'i-lucide-shield-check' },
  { label: 'Open source benchmarks', icon: 'i-lucide-code' },
]

interface Benchmark {
  lib: string
  ops: number
  color: string
}

const benchmarks: Benchmark[][] = [
  [
    { lib: 'evlog', ops: 1020000, color: 'accent-blue' },
    { lib: 'consola', ops: 689700, color: 'amber-500' },
    { lib: 'pino', ops: 472800, color: 'emerald-500' },
    { lib: 'winston', ops: 373300, color: 'zinc-500' },
  ],
  [
    { lib: 'evlog', ops: 818500, color: 'accent-blue' },
    { lib: 'consola', ops: 476500, color: 'amber-500' },
    { lib: 'pino', ops: 283400, color: 'emerald-500' },
    { lib: 'winston', ops: 131900, color: 'zinc-500' },
  ],
  [
    { lib: 'evlog', ops: 7600000, color: 'accent-blue' },
    { lib: 'pino', ops: 2410000, color: 'emerald-500' },
    { lib: 'winston', ops: 1760000, color: 'zinc-500' },
    { lib: 'consola', ops: 121500, color: 'amber-500' },
  ],
]

const benchLabels = ['String log', 'Structured (5 fields)', 'Logger creation']
const activeBench = ref(0)

function formatOps(ops: number): string {
  if (ops >= 1_000_000) return `${(ops / 1_000_000).toFixed(1)}M`
  return `${(ops / 1000).toFixed(0)}K`
}

function barWidth(bench: Benchmark[], entry: Benchmark): number {
  const max = bench[0]?.ops ?? 1
  return Math.max(4, (entry.ops / max) * 100)
}

function speedLabel(bench: Benchmark[], entry: Benchmark): string {
  const evlogOps = bench[0]?.ops ?? 1
  const ratio = evlogOps / entry.ops
  return `${ratio.toFixed(1)}x slower`
}

let observer: IntersectionObserver | undefined

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const el = panelRef.value
  if (el) {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          animStarted.value = true
          observer?.disconnect()
        }
      },
      { threshold: 0.3 },
    )
    observer.observe(el)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
})
</script>

<template>
  <section class="py-24 md:py-32">
    <Motion
      :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
      :while-in-view="{ opacity: 1, y: 0 }"
      :transition="{ duration: 0.5 }"
      :in-view-options="{ once: true }"
      class="mb-8"
    >
      <div>
        <p v-if="$slots.headline" class="section-label">
          <slot name="headline" mdc-unwrap="p" />
        </p>
        <div class="relative mb-5">
          <h2 class="section-title max-w-2xl">
            <slot name="title" mdc-unwrap="p" /><span class="text-primary">.</span>
          </h2>
          <div aria-hidden="true" class="absolute inset-0 section-title max-w-2xl blur-xs animate-pulse pointer-events-none">
            <slot name="title" mdc-unwrap="p" /><span class="text-primary">.</span>
          </div>
        </div>
        <p v-if="$slots.description" class="max-w-lg text-sm leading-relaxed text-zinc-400">
          <slot name="description" mdc-unwrap="p" />
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
        <NuxtLink v-if="props.link" :to="props.link" class="mt-4 inline-flex items-center gap-1.5 font-mono text-xs text-zinc-500 hover:text-accent-blue transition-colors">
          {{ props.linkLabel || 'Learn more' }}
          <UIcon name="i-lucide-arrow-right" class="size-3" />
        </NuxtLink>
      </div>
    </Motion>

    <div class="grid gap-6 lg:grid-cols-2 *:min-w-0">
      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
        :while-in-view="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5, delay: 0.1 }"
        :in-view-options="{ once: true }"
      >
        <div ref="panelRef" class="h-full overflow-hidden border border-zinc-800 bg-[#0c0c0e] flex flex-col">
          <div class="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <div class="flex gap-1.5">
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
            </div>
            <span class="ml-3 font-mono text-xs text-zinc-600">benchmark</span>
            <div class="ml-auto flex items-center gap-1">
              <button
                v-for="(label, idx) in benchLabels"
                :key="label"
                class="font-mono text-[10px] px-2 py-0.5 border transition-all duration-300 outline-none cursor-pointer"
                :class="activeBench === idx
                  ? 'border-accent-blue/30 bg-accent-blue/10 text-accent-blue'
                  : 'border-transparent text-zinc-600 hover:text-zinc-400'"
                @click="activeBench = idx"
              >
                {{ label }}
              </button>
            </div>
          </div>

          <div class="grid *:col-start-1 *:row-start-1 flex-1">
            <div
              v-for="(bench, bIdx) in benchmarks"
              :key="bIdx"
              class="p-5 sm:p-6 transition-opacity duration-300"
              :class="activeBench === bIdx ? 'opacity-100' : 'opacity-0 pointer-events-none'"
            >
              <div
                v-for="(entry, eIdx) in bench"
                :key="entry.lib"
                class="flex items-center gap-3 py-2.5"
              >
                <span
                  class="w-14 shrink-0 font-mono text-xs text-right"
                  :class="entry.lib === 'evlog' ? 'text-white font-medium' : 'text-zinc-500'"
                >
                  {{ entry.lib }}
                </span>

                <div class="flex-1 h-7 relative">
                  <div
                    class="absolute inset-y-0 left-0 flex items-center transition-all ease-out"
                    :class="entry.lib === 'evlog' ? 'perf-bar-glow' : ''"
                    :style="{
                      width: animStarted ? `${barWidth(bench, entry)}%` : '0%',
                      transitionDuration: prefersReducedMotion ? '0ms' : `${600 + eIdx * 150}ms`,
                      transitionDelay: prefersReducedMotion ? '0ms' : `${eIdx * 80}ms`,
                    }"
                  >
                    <div
                      class="size-full"
                      :class="{
                        'bg-accent-blue': entry.color === 'accent-blue',
                        'bg-amber-500/60': entry.color === 'amber-500',
                        'bg-emerald-500/60': entry.color === 'emerald-500',
                        'bg-zinc-600/60': entry.color === 'zinc-500',
                      }"
                    />
                  </div>
                </div>

                <span
                  class="shrink-0 font-mono text-xs tabular-nums text-right transition-opacity duration-500 flex items-baseline justify-end gap-1.5"
                  :class="[
                    animStarted ? 'opacity-100' : 'opacity-0',
                    entry.lib === 'evlog' ? 'w-12' : 'w-28',
                  ]"
                  :style="{ transitionDelay: prefersReducedMotion ? '0ms' : `${400 + eIdx * 150}ms` }"
                >
                  <span :class="entry.lib === 'evlog' ? 'text-accent-blue font-medium' : 'text-zinc-600'">
                    {{ formatOps(entry.ops) }}
                  </span>
                  <span
                    v-if="entry.lib !== 'evlog'"
                    class="text-[10px] text-zinc-700"
                  >
                    {{ speedLabel(bench, entry) }}
                  </span>
                </span>
              </div>

              <div class="mt-3 pt-3 border-t border-zinc-800/50">
                <p class="font-mono text-[10px] text-zinc-600">
                  ops/sec · higher is better · silent mode (no I/O)
                </p>
              </div>
            </div>
          </div>

          <div class="border-t border-zinc-800/50 px-5 sm:px-6 py-4">
            <div class="flex items-center font-mono text-[11px]">
              <span class="text-white font-medium tabular-nums">0</span>
              <span class="text-zinc-600 ml-1">deps</span>
              <span class="text-zinc-800 mx-3">/</span>
              <span class="text-white font-medium tabular-nums">5.1 kB</span>
              <span class="text-zinc-600 ml-1">gzip</span>
              <span class="text-zinc-800 mx-3">/</span>
              <span class="text-white font-medium tabular-nums">12</span>
              <span class="text-zinc-600 ml-1">frameworks</span>
              <span class="text-zinc-800 mx-3">/</span>
              <span class="text-zinc-600">tree-shakeable</span>
            </div>
          </div>
        </div>
      </Motion>

      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
        :while-in-view="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5, delay: 0.2 }"
        :in-view-options="{ once: true }"
      >
        <div class="h-full overflow-hidden border border-zinc-800 bg-[#0c0c0e] flex flex-col">
          <div class="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <div class="flex gap-1.5">
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
            </div>
            <span class="ml-3 font-mono text-xs text-zinc-600">why it's fast</span>
          </div>

          <div class="p-5 sm:p-6 space-y-5 flex-1">
            <div class="flex items-start gap-3">
              <div class="mt-0.5 flex size-6 shrink-0 items-center justify-center border border-accent-blue/20 bg-accent-blue/5">
                <UIcon name="i-lucide-merge" class="size-3.5 text-accent-blue" />
              </div>
              <div>
                <p class="font-mono text-xs text-zinc-300">
                  1 event, not N log lines
                </p>
                <p class="mt-0.5 text-[11px] leading-relaxed text-zinc-600">
                  Accumulate context, emit once. 75% less data downstream.
                </p>
              </div>
            </div>

            <div class="flex items-start gap-3">
              <div class="mt-0.5 flex size-6 shrink-0 items-center justify-center border border-accent-blue/20 bg-accent-blue/5">
                <UIcon name="i-lucide-pen-tool" class="size-3.5 text-accent-blue" />
              </div>
              <div>
                <p class="font-mono text-xs text-zinc-300">
                  In-place mutations
                </p>
                <p class="mt-0.5 text-[11px] leading-relaxed text-zinc-600">
                  No object spreads, no copies. Direct recursive merge.
                </p>
              </div>
            </div>

            <div class="flex items-start gap-3">
              <div class="mt-0.5 flex size-6 shrink-0 items-center justify-center border border-accent-blue/20 bg-accent-blue/5">
                <UIcon name="i-lucide-clock" class="size-3.5 text-accent-blue" />
              </div>
              <div>
                <p class="font-mono text-xs text-zinc-300">
                  Lazy allocation
                </p>
                <p class="mt-0.5 text-[11px] leading-relaxed text-zinc-600">
                  Timestamps, sampling context — created only when needed.
                </p>
              </div>
            </div>

            <div class="flex items-start gap-3">
              <div class="mt-0.5 flex size-6 shrink-0 items-center justify-center border border-accent-blue/20 bg-accent-blue/5">
                <UIcon name="i-lucide-file-code" class="size-3.5 text-accent-blue" />
              </div>
              <div>
                <p class="font-mono text-xs text-zinc-300">
                  No serialization until drain
                </p>
                <p class="mt-0.5 text-[11px] leading-relaxed text-zinc-600">
                  Plain objects throughout. JSON.stringify runs once at the end.
                </p>
              </div>
            </div>

            <div class="flex items-start gap-3">
              <div class="mt-0.5 flex size-6 shrink-0 items-center justify-center border border-accent-blue/20 bg-accent-blue/5">
                <UIcon name="i-lucide-box" class="size-3.5 text-accent-blue" />
              </div>
              <div>
                <p class="font-mono text-xs text-zinc-300">
                  Zero dependencies
                </p>
                <p class="mt-0.5 text-[11px] leading-relaxed text-zinc-600">
                  No transitive deps. Nothing to audit, nothing to break.
                </p>
              </div>
            </div>
          </div>

          <div class="border-t border-zinc-800/50 px-5 sm:px-6 py-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="font-mono text-xs text-zinc-300">
                  Total overhead per request
                </p>
                <p class="font-mono text-[10px] text-zinc-600 mt-0.5">
                  create + 3x set + emit + sampling + enrichers
                </p>
              </div>
              <div class="text-right">
                <p class="font-mono text-xl font-medium text-accent-blue tabular-nums">
                  ~7µs
                </p>
                <p class="font-mono text-[10px] text-zinc-600">
                  0.007ms
                </p>
              </div>
            </div>
          </div>
        </div>
      </Motion>
    </div>
  </section>
</template>

<style scoped>
.perf-bar-glow {
  filter: drop-shadow(0 0 6px rgba(40, 83, 255, 0.3));
}
</style>
