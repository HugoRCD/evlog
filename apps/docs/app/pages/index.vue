<script setup lang="ts">
definePageMeta({
  colorMode: 'dark',
  layout: false,
})

const { data: page } = await useAsyncData('evlog-docs-home', () => {
  return queryCollection('docs').path('/landing').first()
}, {
  getCachedData(key, nuxtApp) {
    return nuxtApp.payload.data[key] ?? nuxtApp.static.data[key]
  },
})

const structuredData = computed(() => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'evlog',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Node.js, Bun, Deno, Cloudflare Workers, all major browsers',
      description: 'A modern TypeScript logger for everything you ship. Simple structured logs, wide events, and structured errors in one API across scripts, libraries, jobs, edge, and requests.',
      url: 'https://www.evlog.dev/',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      license: 'https://github.com/hugorcd/evlog/blob/main/LICENSE',
      author: { '@type': 'Person', name: 'HugoRCD', url: 'https://hrcd.fr/' },
    },
    {
      '@type': 'FAQPage',
      mainEntity: collectFaqEntries(page.value?.body?.value ?? []).map(entry => ({
        '@type': 'Question',
        name: entry.question,
        acceptedAnswer: { '@type': 'Answer', text: entry.answer },
      })),
    },
  ],
}))

useHead({
  titleTemplate: '',
  script: [
    {
      type: 'application/ld+json',
      innerHTML: () => JSON.stringify(structuredData.value),
    },
  ],
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
