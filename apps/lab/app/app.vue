<script setup lang="ts">
/**
 * Page views, counted from the component rather than the Nuxt module.
 *
 * `@vercel/analytics/nuxt` registers its plugin through `addTemplate`, and on
 * this Nuxt version that template never reached the build — no plugin was
 * emitted, nothing ran, and the deployed page loaded no script. The component is
 * the same collector without that step, so it works by being mounted.
 *
 * It reports nothing off Vercel and nothing in development, so there is no flag
 * to remember and no traffic from a local session.
 */
import { Analytics } from '@vercel/analytics/vue'
</script>

<template>
  <NuxtPage />
  <Analytics />
</template>
