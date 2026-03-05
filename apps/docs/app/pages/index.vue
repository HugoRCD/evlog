<script setup lang="ts">
definePageMeta({
  colorMode: 'dark',
  layout: false,
})

useHead({
  titleTemplate: '',
})

const { data: page } = await useAsyncData('landing', () => {
  return queryCollection('docs').path('/landing').first()
})

useSeoMeta({
  title: page.value?.title || 'evlog - Stop grepping through chaos',
  description: page.value?.description || 'Wide events and structured errors for TypeScript. One log per request, full context, errors that explain why and how to fix.',
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
