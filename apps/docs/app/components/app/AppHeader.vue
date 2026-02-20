<script setup lang="ts">
const appConfig = useAppConfig()
const site = useSiteConfig()
const route = useRoute()
const { isEnabled: isAssistantEnabled } = useAssistant()

const isHome = computed(() => route.path === '/')
const links = computed(() => appConfig.github?.url
  ? [
    {
      'icon': 'i-simple-icons-github',
      'to': appConfig.github.url,
      'target': '_blank',
      'aria-label': 'GitHub',
    },
  ]
  : [])

const headerUi = computed(() => isHome.value
  ? { root: 'fixed inset-x-0 top-0 bg-transparent backdrop-blur-none border-transparent z-50', center: 'flex-1' }
  : { center: 'flex-1' })
</script>

<template>
  <Blur v-if="isHome" position="both" class="z-10" />
  <UHeader
    :ui="headerUi"
    to="/"
    :title="appConfig.header?.title || site.name"
  >
    <AppHeaderCenter />

    <template #title>
      <AppHeaderLogo class="h-6 w-auto shrink-0" />
    </template>

    <template #right>
      <AppHeaderCTA />

      <template v-if="isAssistantEnabled">
        <AssistantChat />
      </template>

      <UContentSearchButton />

      <template v-if="links?.length">
        <UButton
          v-for="(link, index) of links"
          :key="index"
          v-bind="{ color: 'neutral', variant: 'ghost', ...link }"
        />
      </template>
    </template>

    <template #toggle="{ open, toggle }">
      <IconMenuToggle
        :open
        class="lg:hidden"
        @click="toggle"
      />
    </template>

    <template #body>
      <AppHeaderBody />
    </template>
  </UHeader>
</template>
