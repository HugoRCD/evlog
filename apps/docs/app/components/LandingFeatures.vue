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
    title: 'Log Draining',
    description: 'Send logs to external services in fire-and-forget mode. Never blocks your response.',
    code: `nitroApp.hooks.hook('evlog:drain',
  async (ctx) => {
    await sendToAxiom(ctx.event)
  }
)`,
  },
  {
    title: 'Built-in Adapters',
    description: 'Zero-config adapters for Axiom, OTLP, PostHog, Sentry, Better Stack, or build your own.',
    code: `import { createAxiomDrain } from 'evlog/axiom'
import { createOTLPDrain } from 'evlog/otlp'
import { createPostHogDrain } from 'evlog/posthog'
import { createSentryDrain } from 'evlog/sentry'
import { createBetterStackDrain } from 'evlog/better-stack'`,
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
    title: 'Nuxt & Nitro',
    description: 'First-class integration. Auto-create loggers, auto-emit at request end.',
    code: `export default defineNuxtConfig({
  modules: ['evlog/nuxt'],
})`,
  },
  {
    title: 'Next.js',
    description: 'App Router support with AsyncLocalStorage. Wrap handlers, get full observability.',
    code: `import { createEvlog } from 'evlog/next'

export const { withEvlog, useLogger } = createEvlog({
  service: 'my-app',
})`,
  },
  {
    title: 'Client Transport',
    description: 'Send browser logs to your server. Automatic enrichment with server context.',
    code: `// Browser
log.info({ action: 'click' })
// → Sent to /api/_evlog/ingest
// → Enriched & drained server-side`,
  },
  {
    title: 'Pretty & JSON',
    description: 'Human-readable in dev, machine-parseable JSON in production.',
    code: `[INFO] POST /api/checkout (234ms)
  user: { id: 1, plan: "pro" }
  cart: { items: 3 }`,
  },
  {
    title: 'Enrichers',
    description: 'Auto-enrich events with user agent, geo, request size, and W3C trace context.',
    code: `import { createUserAgentEnricher } from 'evlog/enrichers'
import { createGeoEnricher } from 'evlog/enrichers'
import { createTraceContextEnricher } from 'evlog/enrichers'`,
  },
  {
    title: 'Hono & Workers',
    description: 'Standalone API for Hono, Cloudflare Workers, Bun, or any TypeScript runtime.',
    code: `import { initLogger, createRequestLogger } from 'evlog'

const log = createRequestLogger({ method, path })
log.set({ user: { id, plan } })
log.emit()`,
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
].map(feature => ({
  ...feature,
  code: `\`\`\`ts\n${feature.code}\n\`\`\``,
}))
</script>

<template>
  <UPageSection :ui="{ container: 'gap-0 lg:gap-0'}">
    <Motion
      :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
      :in-view="{ opacity: 1, y: 0 }"
      :transition="{ duration: 0.5 }"
      :in-view-options="{ once: true }"
      class="mb-12"
    >
      <p class="section-label mb-4 font-pixel text-xs uppercase tracking-widest text-muted">
        Features
      </p>
      <h2 class="section-title">
        Everything you need<span class="text-primary">.</span>
      </h2>
    </Motion>

    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <UTheme :ui="{ prose: { pre: { base: 'whitespace-pre text-xs px-2 py-2', copy: 'top-[6px] right-[6px] *:data-[slot=leadingIcon]:size-3' }} }">
        <Motion
          v-for="(feature, index) in features"
          :key="feature.title"
          :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 16 }"
          :in-view="{ opacity: 1, y: 0 }"
          :transition="{ duration: 0.4, delay: index * 0.05 }"
          :in-view-options="{ once: true }"
        >
          <div class="group h-full border border-muted/50 bg-muted/30 p-5 transition-colors duration-300 hover:border-muted">
            <h3 class="mb-2 font-pixel font-semibold text-primary">
              {{ feature.title }}
            </h3>
            <p class="mb-4 text-sm leading-relaxed text-toned">
              {{ feature.description }}
            </p>
            <MDC :value="feature.code" />
          </div>
        </Motion>
      </UTheme>
    </div>
  </UPageSection>
</template>
