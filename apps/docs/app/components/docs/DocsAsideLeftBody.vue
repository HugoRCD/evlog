<script setup lang="ts">
/**
 * Local override of the Docus DocsAsideLeftBody.
 *
 * Reason: the upstream component renders the sidebar with `UContentNavigation`,
 * which uses a reka-ui Accordion under the hood. With the default props, items
 * with children render collapsed unless they are on the active route — so users
 * have to click each section to discover its sub-pages. We want the full tree
 * visible at all times, so we render a flat recursive nav and skip the
 * accordion entirely.
 */
import type { ContentNavigationItem } from '@nuxt/content'

const { sidebarNavigation } = useSubNavigation()
</script>

<template>
  <nav>
    <ul class="flex flex-col">
      <DocsAsideLeftBodyItem
        v-for="(item, index) in sidebarNavigation"
        :key="(item as ContentNavigationItem).path ?? `root-${index}`"
        :item="(item as ContentNavigationItem)"
        :level="0"
      />
    </ul>
  </nav>
</template>
