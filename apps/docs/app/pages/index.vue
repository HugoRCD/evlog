<script setup lang="ts">
definePageMeta({
  colorMode: 'dark',
  layout: false,
})

const softwareSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'evlog',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Node.js, Bun, Deno, Cloudflare Workers, all major browsers',
  description: 'A modern TypeScript logger for everything you ship. Simple structured logs, wide events, and structured errors in one API across scripts, libraries, jobs, edge, and requests.',
  url: 'https://www.evlog.dev/',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  license: 'https://github.com/hugorcd/evlog/blob/main/LICENSE',
  author: { '@type': 'Person', name: 'HugoRCD', url: 'https://hugorcd.com/' },
}

useHead({
  titleTemplate: '',
  script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(softwareSchema) }],
  link: [
    { rel: 'canonical', href: 'https://www.evlog.dev/' },
    {
      rel: 'preload',
      href: '/fonts/GeistPixel-Line.woff2',
      as: 'font',
      type: 'font/woff2',
      crossorigin: '',
    },
  ],
})

const { data: page } = await useAsyncData('evlog-docs-home', () => {
  return queryCollection('docs').path('/landing').first()
}, {
  getCachedData(key, nuxtApp) {
    return nuxtApp.payload.data[key] ?? nuxtApp.static.data[key]
  },
})

// Read back from the accordion the page renders, so an answer edited in
// `0.landing.md` never disagrees with the one search engines are given.
const faq = computed(() => faqSchema(page.value?.body))

useHead(() => ({
  script: faq.value ? [{ type: 'application/ld+json', innerHTML: JSON.stringify(faq.value) }] : [],
}))

useSeoMeta({
  title:
    page.value?.title
    || `evlog — Digging through logs is not observability. It's hope.`,
  description:
    page.value?.description
    || 'A modern TypeScript logger built for everything you ship — scripts, libraries, jobs, edge, requests. Simple logs, wide events, and structured errors in one API.',
  ogImage: '/og.png',
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogUrl: 'https://www.evlog.dev/',
  twitterSite: '@hugorcd',
  twitterCreator: '@hugorcd',
})
</script>

<template>
  <main v-if="page">
    <ContentRenderer :value="page" />
  </main>
</template>
