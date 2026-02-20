<script setup lang="ts">
const route = useRoute()
const isHome = computed(() => route.path === '/')

const landingItems = [
  {
    label: 'Docs',
    to: '/getting-started/introduction',
    children: [
      {
        label: 'Introduction',
        icon: 'i-lucide-book-open',
        description: 'What is evlog and why use it',
        to: '/getting-started/introduction'
      },
      {
        label: 'Installation',
        icon: 'i-lucide-download',
        description: 'Install evlog in your project',
        to: '/getting-started/installation'
      },
      {
        label: 'Quick Start',
        icon: 'i-lucide-zap',
        description: 'Get up and running in minutes',
        to: '/getting-started/quick-start'
      },
      {
        label: 'Agent Skills',
        icon: 'i-lucide-bot',
        description: 'Use evlog with AI coding agents',
        to: '/getting-started/agent-skills'
      }
    ]
  },
  {
    label: 'Core Concepts',
    to: '/core-concepts/wide-events',
    children: [
      {
        label: 'Wide Events',
        icon: 'i-lucide-rows-3',
        description: 'One log per request, full context',
        to: '/core-concepts/wide-events'
      },
      {
        label: 'Structured Errors',
        icon: 'i-lucide-shield-alert',
        description: 'Errors that explain why and how to fix',
        to: '/core-concepts/structured-errors'
      },
      {
        label: 'Typed Fields',
        icon: 'i-lucide-braces',
        description: 'Type-safe log fields',
        to: '/core-concepts/typed-fields'
      }
    ]
  },
  {
    label: 'Adapters',
    to: '/adapters/overview',
    children: [
      {
        label: 'Axiom',
        icon: 'i-custom-axiom',
        description: 'Send logs to Axiom',
        to: '/adapters/axiom'
      },
      {
        label: 'OpenTelemetry',
        icon: 'i-simple-icons-opentelemetry',
        description: 'Export via OTLP protocol',
        to: '/adapters/otlp'
      },
      {
        label: 'PostHog',
        icon: 'i-simple-icons-posthog',
        description: 'Send events to PostHog',
        to: '/adapters/posthog'
      },
      {
        label: 'Sentry',
        icon: 'i-simple-icons-sentry',
        description: 'Report errors to Sentry',
        to: '/adapters/sentry'
      },
      {
        label: 'Better Stack',
        icon: 'i-simple-icons-betterstack',
        description: 'Stream logs to Better Stack',
        to: '/adapters/better-stack'
      }
    ]
  },
  {
    label: 'Releases',
    to: 'https://github.com/hugorcd/evlog/releases',
    target: '_blank',
  }
]

const docsItems = [
  {
    label: 'Getting Started',
    to: '/getting-started/introduction',
  },
  {
    label: 'Core Concepts',
    to: '/core-concepts/wide-events',
  },
  {
    label: 'Adapters',
    to: '/adapters/overview',
  },
  {
    label: 'Enrichers',
    to: '/enrichers/overview',
  }
]
</script>

<template>
  <UNavigationMenu
    v-if="isHome"
    variant="link"
    color="neutral"
    :items="landingItems"
    :ui="{
      linkTrailingIcon: 'hidden',
      childLink: 'hover:bg-elevated/50',
      viewport: 'bg-default backdrop-blur-xl ring ring-offset-6 ring-offset-bg ring-default border border-default',
      viewportWrapper: 'w-[600px] transition-all duration-500 left-1/2 -translate-x-1/2',
    }"
  />
  <UNavigationMenu
    v-else
    variant="link"
    color="neutral"
    :items="docsItems"
    :ui="{ linkTrailingIcon: 'hidden' }"
  />
</template>
