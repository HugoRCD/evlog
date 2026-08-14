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
                name: 'What does evlog do that console.log or pino can\'t?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'evlog turns log lines into wide events: one request, one event, carrying context, results, and errors together instead of a dozen separate lines. You keep a console-like API, so it is drop-in for console.log, pino, or consola, but the output is a single correlated event you can search, sample, and alert on.',
                },
              },
              {
                '@type': 'Question',
                name: 'How is evlog different from an observability platform?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'A platform observes a running app and needs traffic, agents, or instrumentation before it can reveal a gap. evlog is a library with a CLI: evlog map scans your entry points statically and finds missing observability before any traffic exists. Platforms and evlog work well together: evlog makes the events, a drain ships them.',
                },
              },
              {
                '@type': 'Question',
                name: 'Can I adopt it without rewriting everything?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'Yes. Because the API mirrors console, pino, and consola, you can drop evlog in and keep working logs from the first minute. Structured errors use createError instead of new Error, so errors carry a why and a fix field, not just a stack.',
                },
              },
              {
                '@type': 'Question',
                name: 'Does it work in edge runtimes?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'Yes. evlog targets scripts, libraries, jobs, edge, and HTTP requests. It has zero runtime dependencies, so there is no dependency tree to audit just to log, and it deploys cleanly to edge runtimes where footprint and cold start matter.',
                },
              },
              {
                '@type': 'Question',
                name: 'Is evlog fast?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'evlog adds roughly 3µs of overhead per request and is around 6 kB gzip. In the wide event pattern it is 7.7x faster than pino, because it sends one correlated event instead of several separate lines.',
                },
              },
              {
                '@type': 'Question',
                name: 'Is evlog free and open source?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'Yes. evlog is MIT-licensed and open source with zero dependencies. Nothing pulls in a dependency tree you have to audit just to log.',
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
