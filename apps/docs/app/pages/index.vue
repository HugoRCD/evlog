<script setup lang="ts">
definePageMeta({
  colorMode: 'dark',
  layout: false,
})

useHead({
  titleTemplate: '',
  script: [
    {
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'SoftwareApplication',
            name: 'evlog',
            applicationCategory: 'DeveloperApplication',
            operatingSystem: 'Node.js, all major browsers',
            description: 'A modern TypeScript logger for everything you ship. Simple structured logs, wide events, and structured errors in one API across scripts, libraries, jobs, edge, and requests.',
            url: 'https://www.evlog.dev/',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            license: 'https://github.com/hugorcd/evlog/blob/main/LICENSE',
            author: { '@type': 'Organization', name: 'evlog' },
          },
          {
            '@type': 'FAQPage',
            mainEntity: [
              {
                '@type': 'Question',
                name: 'What is evlog?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'evlog is a modern TypeScript logger that replaces log lines with wide events. Simple structured logs, structured errors, and lifecycle tracking in one API, across scripts, libraries, jobs, edge, and requests.',
                },
              },
              {
                '@type': 'Question',
                name: 'Is evlog a drop-in replacement for console.log, pino, or consola?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'Yes. evlog is MIT-licensed and drop-in for console.log, pino, or consola, so you can start using it without rewriting your existing calls.',
                },
              },
              {
                '@type': 'Question',
                name: 'How fast is evlog?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'evlog adds about 3 microseconds of overhead per request, zero dependencies, and roughly 6 kB gzip. It is 7.7x faster than pino in the wide event pattern while sending correlated events instead of separate log lines.',
                },
              },
              {
                '@type': 'Question',
                name: 'What is evlog map?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'evlog map is a deterministic observability test for your app. It statically scans every entry point, scores wide-event coverage, and gates in CI, so the same code always produces the same score.',
                },
              },
            ],
          },
        ],
      }),
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

const { data: page } = await useAsyncData('evlog-docs-home', () => {
  return queryCollection('docs').path('/landing').first()
}, {
  getCachedData(key, nuxtApp) {
    return nuxtApp.payload.data[key] ?? nuxtApp.static.data[key]
  },
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
