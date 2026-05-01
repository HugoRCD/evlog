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
    label: 'Logging',
    to: '/logging/overview',
    children: [
      {
        label: 'Simple Logging',
        icon: 'i-lucide-terminal',
        description: 'Fire-and-forget structured logs',
        to: '/logging/simple-logging'
      },
      {
        label: 'Wide Events',
        icon: 'i-lucide-rows-3',
        description: 'Accumulate context, emit once',
        to: '/logging/wide-events'
      },
      {
        label: 'Structured Errors',
        icon: 'i-lucide-shield-alert',
        description: 'Errors that explain why and how to fix',
        to: '/logging/structured-errors'
      },
      {
        label: 'Client Logging',
        icon: 'i-lucide-monitor',
        description: 'Browser-side logging and transport',
        to: '/logging/client-logging'
      },
      {
        label: 'AI SDK',
        icon: 'i-simple-icons-vercel',
        description: 'AI observability with token tracking',
        to: '/logging/ai-sdk'
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
        to: '/adapters/cloud/axiom'
      },
      {
        label: 'OpenTelemetry',
        icon: 'i-simple-icons-opentelemetry',
        description: 'Export via OTLP protocol',
        to: '/adapters/cloud/otlp'
      },
      {
        label: 'HyperDX',
        icon: 'i-custom-hyperdx',
        description: 'Send logs to HyperDX via OTLP',
        to: '/adapters/cloud/hyperdx'
      },
      {
        label: 'PostHog',
        icon: 'i-simple-icons-posthog',
        description: 'Send logs to PostHog',
        to: '/adapters/cloud/posthog'
      },
      {
        label: 'Sentry',
        icon: 'i-simple-icons-sentry',
        description: 'Report errors to Sentry',
        to: '/adapters/cloud/sentry'
      },
      {
        label: 'Better Stack',
        icon: 'i-simple-icons-betterstack',
        description: 'Stream logs to Better Stack',
        to: '/adapters/cloud/better-stack'
      },
      {
        label: 'Datadog',
        icon: 'i-simple-icons-datadog',
        description: 'Send logs to Datadog',
        to: '/adapters/cloud/datadog'
      }
    ]
  },
  {
    label: 'Releases',
    to: 'https://github.com/hugorcd/evlog/releases',
    target: '_blank',
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
  <UContentSearchButton
    v-else
    :collapsed="false"
    class="w-full"
    variant="soft"
    :ui="{ leadingIcon: 'size-4 mr-1' }"
  />
</template>
