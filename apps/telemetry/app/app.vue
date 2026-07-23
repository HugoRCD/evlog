<script setup lang="ts">
// Global head — favicons + OG/social meta for every route. This app is
// self-hosted per-deployment (unlike apps/docs, which has a fixed evlog.dev
// domain), so there's no single canonical URL to hardcode here; `ogUrl` is
// intentionally omitted rather than guessed.
useHead({
  htmlAttrs: { lang: 'en' },
  link: [
    { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
    { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
    { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
    { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
  ],
  meta: [{ name: 'theme-color', content: '#09090b' },],
})

useSeoMeta({
  title: 'evlog telemetry',
  description: 'A self-hostable analytics dashboard for evlog CLI telemetry: run totals, success/error rates, environments, top commands, and a raw events browser.',
  ogTitle: 'evlog telemetry',
  ogDescription: 'A self-hostable analytics dashboard for evlog CLI telemetry: run totals, success/error rates, environments, top commands, and a raw events browser.',
  ogImage: '/og.png',
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterImage: '/og.png',
})
</script>

<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
