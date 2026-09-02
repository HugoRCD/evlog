<script setup lang="ts">
const { data: repo } = useFetch('https://ungh.cc/repos/evloghq/evlog', {
  lazy: true,
  transform: (data: { repo: { stars: number } }) => data.repo,
  default: () => ({ stars: 0 }),
  getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key] ?? nuxtApp.static.data[key],
})
</script>

<template>
  <div class="my-4 flex flex-wrap items-center gap-3">
    <NuxtLink
      to="https://github.com/evloghq/evlog"
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1.5 border border-default px-2.5 py-1 text-xs text-muted transition-colors hover:border-highlighted hover:text-highlighted"
    >
      <UIcon name="i-simple-icons-github" class="size-3.5" />
      <span v-if="repo.stars" class="font-medium">{{ repo.stars }}</span>
      <span class="text-muted/60">stars</span>
    </NuxtLink>
    <NuxtLink
      to="https://www.npmjs.com/package/evlog"
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1.5 border border-default px-2.5 py-1 text-xs text-muted transition-colors hover:border-highlighted hover:text-highlighted"
    >
      <UIcon name="i-simple-icons-npm" class="size-3.5" />
      <span class="font-medium">evlog</span>
    </NuxtLink>
  </div>
</template>
