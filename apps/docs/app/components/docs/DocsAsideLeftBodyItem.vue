<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'

const props = defineProps<{
  item: ContentNavigationItem
  level: number
}>()

const route = useRoute()

/**
 * Walk down to the first descendant page so parents that point at a folder
 * (no index file) still navigate somewhere useful — typically their `Overview`
 * child. Mirrors `getFirstPagePath` in `docus/composables/useSubNavigation`.
 */
function getFirstPagePath(item: ContentNavigationItem): string {
  let current = item
  while (current.children?.length) {
    current = current.children[0]!
  }
  return current.path
}

const hasChildren = computed(() => Array.isArray(props.item.children) && props.item.children.length > 0)
const linkPath = computed(() => hasChildren.value ? getFirstPagePath(props.item) : props.item.path)
const isActive = computed(() => route.path === props.item.path || route.path === linkPath.value)

const itemClasses = 'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors'
const inactiveClasses = 'text-muted hover:text-default hover:bg-elevated/50'
const activeClasses = 'bg-primary/10 text-primary font-medium'
const headerClasses = 'text-default font-medium hover:text-primary'
</script>

<template>
  <li>
    <ULink
      :to="linkPath"
      :class="[
        itemClasses,
        hasChildren && !isActive ? headerClasses : (isActive ? activeClasses : inactiveClasses),
      ]"
    >
      <UIcon
        v-if="item.icon"
        :name="(item.icon as string)"
        class="size-4 shrink-0"
      />
      <span class="truncate">{{ item.title }}</span>
    </ULink>
    <ul
      v-if="hasChildren"
      class="ml-3 mt-px flex flex-col border-l border-default pl-3"
    >
      <DocsAsideLeftBodyItem
        v-for="(child, index) in item.children"
        :key="(child as ContentNavigationItem).path ?? `${item.path}-${index}`"
        :item="(child as ContentNavigationItem)"
        :level="level + 1"
      />
    </ul>
  </li>
</template>
