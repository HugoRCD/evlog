<script setup lang="ts">
import { Motion } from 'motion-v'

const prefersReducedMotion = ref(false)

const props = defineProps<{
  link?: string
  linkLabel?: string
}>()

const pills = [
  { label: 'CLIs & scripts', icon: 'i-lucide-terminal' },
  { label: 'Libraries', icon: 'i-lucide-package' },
  { label: 'Edge & workers', icon: 'i-lucide-cloud' },
  { label: 'Jobs & queues', icon: 'i-lucide-clock' },
]

interface Context {
  id: string
  label: string
  filename: string
  icon: string
  lines: string[]
}

const contexts: Context[] = [
  {
    id: 'cli',
    label: 'CLI',
    filename: 'scripts/migrate.ts',
    icon: 'i-lucide-terminal',
    lines: [
      '<span class="text-violet-400">import</span> { initLogger, log } <span class="text-violet-400">from</span> <span class="text-emerald-400">\'evlog\'</span>',
      '',
      '<span class="text-amber-400">initLogger</span>({ <span class="text-sky-400">env</span>: { <span class="text-sky-400">service</span>: <span class="text-emerald-400">\'migrate\'</span> } })',
      '',
      'log.<span class="text-amber-400">info</span>(<span class="text-emerald-400">\'cli\'</span>, <span class="text-emerald-400">\'Starting migration\'</span>)',
      'log.<span class="text-amber-400">info</span>({ <span class="text-sky-400">action</span>: <span class="text-emerald-400">\'migrate\'</span>, <span class="text-sky-400">records</span>: <span class="text-pink-400">1250</span> })',
    ],
  },
  {
    id: 'library',
    label: 'Library',
    filename: 'src/my-lib.ts',
    icon: 'i-lucide-package',
    lines: [
      '<span class="text-violet-400">import</span> { createLogger } <span class="text-violet-400">from</span> <span class="text-emerald-400">\'evlog\'</span>',
      '',
      '<span class="text-dimmed">// Never call initLogger from a library.</span>',
      '<span class="text-dimmed">// The host app owns the global config + drain.</span>',
      '',
      '<span class="text-violet-400">export function</span> <span class="text-amber-400">processWebhook</span>(payload) {',
      '  <span class="text-violet-400">const</span> log = <span class="text-amber-400">createLogger</span>({ <span class="text-sky-400">lib</span>: <span class="text-emerald-400">\'mylib\'</span> })',
      '  log.<span class="text-amber-400">set</span>({ <span class="text-sky-400">type</span>: payload.type })',
      '  log.<span class="text-amber-400">emit</span>()',
      '}',
    ],
  },
  {
    id: 'edge',
    label: 'Edge',
    filename: 'src/worker.ts',
    icon: 'i-lucide-cloud',
    lines: [
      '<span class="text-violet-400">import</span> { initWorkersLogger, createWorkersLogger } <span class="text-violet-400">from</span> <span class="text-emerald-400">\'evlog/workers\'</span>',
      '',
      '<span class="text-amber-400">initWorkersLogger</span>({ <span class="text-sky-400">env</span>: { <span class="text-sky-400">service</span>: <span class="text-emerald-400">\'edge\'</span> } })',
      '',
      '<span class="text-violet-400">export default</span> {',
      '  <span class="text-violet-400">async</span> <span class="text-amber-400">fetch</span>(req) {',
      '    <span class="text-violet-400">const</span> log = <span class="text-amber-400">createWorkersLogger</span>(req)',
      '    log.<span class="text-amber-400">set</span>({ <span class="text-sky-400">cf</span>: req.cf?.country })',
      '    log.<span class="text-amber-400">emit</span>()',
      '  },',
      '}',
    ],
  },
  {
    id: 'job',
    label: 'Job',
    filename: 'jobs/sync.ts',
    icon: 'i-lucide-clock',
    lines: [
      '<span class="text-violet-400">import</span> { createLogger } <span class="text-violet-400">from</span> <span class="text-emerald-400">\'evlog\'</span>',
      '',
      '<span class="text-violet-400">export async function</span> <span class="text-amber-400">runJob</span>(job) {',
      '  <span class="text-violet-400">const</span> log = <span class="text-amber-400">createLogger</span>({',
      '    <span class="text-sky-400">jobId</span>: job.id, <span class="text-sky-400">queue</span>: <span class="text-emerald-400">\'emails\'</span>,',
      '  })',
      '  log.<span class="text-amber-400">set</span>({ <span class="text-sky-400">batch</span>: { <span class="text-sky-400">size</span>: <span class="text-pink-400">50</span> } })',
      '  log.<span class="text-amber-400">emit</span>()',
      '}',
    ],
  },
]

const activeContext = ref(0)

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})
</script>

<template>
  <section class="py-24 md:py-32">
    <Motion
      :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
      :while-in-view="{ opacity: 1, y: 0 }"
      :transition="{ duration: 0.5 }"
      :in-view-options="{ once: true }"
      class="mb-10"
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
        <p v-if="$slots.description" class="max-w-lg text-sm leading-relaxed text-muted">
          <slot name="description" mdc-unwrap="p" />
        </p>
        <div class="mt-5 flex flex-wrap gap-2">
          <span
            v-for="pill in pills"
            :key="pill.label"
            class="inline-flex items-center gap-1.5 border border-muted bg-elevated/50 px-3 py-1 font-mono text-[11px] text-muted"
          >
            <UIcon :name="pill.icon" class="size-3 text-primary" />
            {{ pill.label }}
          </span>
        </div>
        <NuxtLink v-if="props.link" :to="props.link" class="mt-4 inline-flex items-center gap-1.5 font-mono text-xs text-dimmed hover:text-primary transition-colors">
          {{ props.linkLabel || 'Learn more' }}
          <UIcon name="i-lucide-arrow-right" class="size-3" />
        </NuxtLink>
      </div>
    </Motion>

    <Motion
      :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
      :while-in-view="{ opacity: 1, y: 0 }"
      :transition="{ duration: 0.5, delay: 0.15 }"
      :in-view-options="{ once: true }"
    >
      <div class="overflow-hidden border border-muted bg-default">
        <div class="flex items-center gap-2 border-b border-muted px-4 py-3">
          <div class="flex gap-1.5">
            <div class="size-3 rounded-full bg-accented" />
            <div class="size-3 rounded-full bg-accented" />
            <div class="size-3 rounded-full bg-accented" />
          </div>
          <span class="ml-3 font-mono text-xs text-dimmed">{{ contexts[activeContext]?.filename }}</span>
          <div class="ml-auto flex items-center gap-1">
            <button
              v-for="(ctx, idx) in contexts"
              :key="ctx.id"
              class="font-mono text-[10px] px-2 py-0.5 border transition-all duration-300 outline-none cursor-pointer flex items-center gap-1"
              :class="activeContext === idx
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-transparent text-dimmed hover:text-muted'"
              @click="activeContext = idx"
            >
              <UIcon :name="ctx.icon" class="size-2.5" />
              {{ ctx.label }}
            </button>
          </div>
        </div>

        <div class="grid *:col-start-1 *:row-start-1">
          <div
            v-for="(ctx, idx) in contexts"
            :key="ctx.id"
            class="p-5 sm:p-6 font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto transition-opacity duration-300"
            :class="activeContext === idx ? 'opacity-100' : 'opacity-0 pointer-events-none'"
          >
            <!-- eslint-disable vue/no-v-html -->
            <pre><code><span v-for="(line, lineIdx) in ctx.lines" :key="lineIdx" class="block min-h-[1.4em]" v-html="line || '&nbsp;'" /></code></pre>
            <!-- eslint-enable -->
          </div>
        </div>

        <div class="border-t border-muted/50 px-5 py-4">
          <p class="font-mono text-[11px] text-dimmed">
            <span class="text-primary">$</span> Same API. Same drains. Same redaction. Same types. Pick what fits the call.
          </p>
        </div>
      </div>
    </Motion>
  </section>
</template>
