<script setup lang="ts">
const faqItems = [
  {
    label: 'What is evlog?',
    content: 'evlog is a modern TypeScript logger that turns log lines into wide events. One API gives you structured logs, structured errors, and request lifecycle tracking, across scripts, libraries, jobs, edge, and HTTP requests.',
  },
  {
    label: 'Is it a drop-in replacement for pino or console.log?',
    content: 'Yes. evlog keeps a console-like API, so it is drop-in for `console.log`, `pino`, or `consola`. You adopt it without rewriting existing calls, and keep working logs from the first minute.',
  },
  {
    label: 'Is evlog free and open source?',
    content: 'Yes. evlog is MIT-licensed and open source. It has zero dependencies, so nothing pulls in a dependency tree you have to audit just to log.',
  },
  {
    label: 'How fast is it?',
    content: 'evlog adds roughly 3µs of overhead per request and is around 6 kB gzip. In the wide event pattern it is 7.7x faster than pino, because it sends one correlated event instead of several separate log lines. Benchmarks are tracked on every pull request.',
  },
  {
    label: 'How is evlog different from an observability platform?',
    content: 'A platform observes a running app and needs traffic, agents, or instrumentation to reveal gaps. evlog is a library with a CLI: it finds missing observability statically, before any traffic exists, when fixes are cheapest.',
  },
  {
    label: 'How do I get started?',
    content: 'Install the package, call `useLogger` in your entry point, and log wide events. The install guide walks through the first logger, structured errors, and shipping to a drain in about ten minutes.',
  },
]
</script>

<template>
  <section class="py-24 md:py-32">
    <div class="mx-auto max-w-3xl px-6">
      <div class="mb-10 text-center">
        <p class="section-label">
          FAQ
        </p>
        <div class="relative mb-4">
          <h2 class="section-title">
            <slot name="title" mdc-unwrap="p" /><span class="text-primary">.</span>
          </h2>
          <div aria-hidden="true" class="title-glow section-title">
            <slot name="title" mdc-unwrap="p" /><span class="text-primary">.</span>
          </div>
        </div>
        <p v-if="$slots.description" class="mx-auto max-w-lg text-sm leading-relaxed text-muted">
          <slot name="description" mdc-unwrap="p" />
        </p>
      </div>

      <UAccordion
        type="single"
        collapsible
        :items="faqItems"
        class="overflow-hidden border border-muted bg-default"
        :ui="{
          item: 'border-b border-muted last:border-b-0',
          trigger: 'px-5 sm:px-6 py-4 text-left font-medium text-highlighted hover:text-primary transition-colors',
        }"
      >
        <template #content="{ item }">
          <div class="px-5 sm:px-6 pb-5 text-sm leading-relaxed text-muted">
            {{ item.content }}
          </div>
        </template>
      </UAccordion>
    </div>
  </section>
</template>
