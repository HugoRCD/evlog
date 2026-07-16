<script setup lang="ts">
import { useSubNavigation } from '#imports'

const appConfig = useAppConfig()
const site = useSiteConfig()
const route = useRoute()
const { isEnabled: isAssistantEnabled, isOpen: isAssistantOpen } = useAssistant()
const { subNavigationMode } = useSubNavigation()

const isHome = computed(() => route.path === '/')
const assistantPanelWidth = '24rem'
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

const headerUi = computed(() => {
  const homeFixed = 'fixed top-0 left-0 bg-transparent backdrop-blur-none border-transparent z-50 transition-[right] duration-200 ease-linear'

  if (isHome.value) {
    return {
      root: homeFixed,
      center: 'flex-1',
    }
  }

  return { center: 'flex-1' }
})

const headerStyle = computed(() => {
  if (!isHome.value) {
    return undefined
  }

  return {
    right: isAssistantEnabled.value && isAssistantOpen.value ? assistantPanelWidth : '0px',
  }
})
</script>

<template>
  <Blur v-if="isHome" position="both" class="z-10" />
  <UHeader
    :ui="headerUi"
    :style="headerStyle"
    :class="{ 'flex flex-col': subNavigationMode === 'header' }"
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

      <UContentSearchButton aria-label="Search documentation" />

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

    <template
      v-if="subNavigationMode === 'header'"
      #bottom
    >
      <AppHeaderBottom />
    </template>
  </UHeader>
</template>
