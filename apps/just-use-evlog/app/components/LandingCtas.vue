<script setup lang="ts">
const { public: pub } = useRuntimeConfig()
const docsUrl = computed(() => pub.docsUrl || 'https://www.evlog.dev')
</script>

<template>
  <div class="flex flex-col gap-6 border-t border-default pt-10 sm:flex-row sm:flex-wrap sm:items-center sm:gap-10">
    <NuxtLink
      :to="`${docsUrl}/getting-started/installation`"
      class="inline-flex items-center justify-center border border-primary bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
      target="_blank"
      rel="noopener noreferrer"
    >
      Read the docs
    </NuxtLink>
    <NuxtLink
      :to="`${docsUrl}/getting-started/quick-start`"
      class="text-muted underline decoration-muted underline-offset-4 transition-colors hover:text-highlighted"
      target="_blank"
      rel="noopener noreferrer"
    >
      Quick start
    </NuxtLink>
    <NuxtLink
      to="https://github.com/evloghq/evlog"
      class="text-muted underline decoration-muted underline-offset-4 transition-colors hover:text-highlighted"
      target="_blank"
      rel="noopener noreferrer"
    >
      GitHub
    </NuxtLink>
  </div>
</template>
