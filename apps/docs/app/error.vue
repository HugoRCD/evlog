<script setup lang="ts">
import type { NuxtError } from '#app'
import type { ContentNavigationItem, PageCollections } from '@nuxt/content'
import * as nuxtUiLocales from '@nuxt/ui/locale'

const props = defineProps<{
  error: NuxtError
}>()

const route = useRoute()

route.meta.layout = 'docs'

const nuxtUiLocale = nuxtUiLocales.en

useHead({
  htmlAttrs: {
    lang: nuxtUiLocale.code,
    dir: nuxtUiLocale.dir,
  },
})

const is404 = computed(() => props.error?.statusCode === 404)

useSeoMeta({
  title: () => is404.value ? 'Page not found' : 'Something went wrong',
  description: () => is404.value
    ? 'The page you are looking for does not exist.'
    : 'An unexpected error occurred.',
})

const { data: navigation } = await useAsyncData('navigation_error', () => queryCollectionNavigation('docs' as keyof PageCollections), {
  transform: (data: ContentNavigationItem[]) => data,
})
const { data: files } = useLazyAsyncData('search_error', () => queryCollectionSearchSections('docs' as keyof PageCollections), {
  server: false,
})

provide('navigation', navigation)

function handleError() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <UApp :locale="nuxtUiLocale">
    <div class="docus-sub-header">
      <AppHeader />

    <UMain class="flex items-center">
      <UContainer>
        <section class="flex flex-col items-center justify-center text-center py-24 lg:py-32">
          <p class="font-mono text-xs uppercase tracking-[0.2em] text-primary mb-6">
            Error {{ error?.statusCode || 500 }}
          </p>
          <h1 class="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-highlighted mb-5">
            {{ is404 ? 'Page not found' : 'Something went wrong' }}
          </h1>
          <p class="text-base sm:text-lg text-muted max-w-xl mb-10">
            {{ is404
              ? 'The page you are looking for does not exist or has been moved.'
              : 'An unexpected error occurred. Please try again or head back home.' }}
          </p>
          <div class="flex flex-wrap items-center justify-center gap-3">
            <UButton
              size="lg"
              color="primary"
              icon="i-lucide-arrow-left"
              @click="handleError"
            >
              Back to home
            </UButton>
            <UButton
              size="lg"
              color="neutral"
              variant="subtle"
              to="/getting-started/introduction"
              icon="i-lucide-book-open"
              trailing
            >
              Read the docs
            </UButton>
          </div>
        </section>
      </UContainer>
    </UMain>

      <AppFooter />
    </div>

    <ClientOnly>
      <LazyUContentSearch
        :files="files"
        :navigation="navigation"
      />
    </ClientOnly>
  </UApp>
</template>

<style>
@media (min-width: 1024px) {
  .docus-sub-header {
    --ui-header-height: 112px;
  }
}
</style>


