<script setup lang="ts">
definePageMeta({
  colorMode: 'dark',
  layout: false,
})

useHead({
  titleTemplate: '',
})

const { data: page } = await useAsyncData('evlog-docs-home', () => {
  return queryCollection('docs').path('/landing').first()
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
  twitterSite: '@hugorcd',
  twitterCreator: '@hugorcd',
})
</script>

<template>
  <div>
    <ContentRenderer v-if="page" :value="page" />
  </div>
</template>
