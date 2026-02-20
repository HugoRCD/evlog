<script setup lang="ts">
definePageMeta({
  colorMode: 'dark',
  layout: false,
})

useSeoMeta({
  title: 'evlog - Stop grepping through chaos',
  description: 'Wide events and structured errors for TypeScript. One log per request, full context, errors that explain why and how to fix.',
  ogImage: '/og.png',
})
</script>

<template>
  <div>
    <LandingHero />
    <LandingFeatures />
    <LandingCta />
  </div>
</template>
