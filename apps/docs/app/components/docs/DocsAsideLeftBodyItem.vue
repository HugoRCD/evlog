<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'

const props = defineProps<{
  item: ContentNavigationItem
  level: number
}>()

const route = useRoute()

const hasChildren = computed(() => Array.isArray(props.item.children) && props.item.children.length > 0)
const isActive = computed(() => route.path === props.item.path)

const itemClasses = 'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors'
const inactiveClasses = 'text-muted hover:text-default hover:bg-elevated/50'
const activeClasses = 'bg-primary/10 text-primary font-medium'
const headerClasses = 'text-default font-medium'
</script>

<template>
  <li>
    <ULink
      v-if="!hasChildren"
      :to="item.path"
      :class="[itemClasses, isActive ? activeClasses : inactiveClasses]"
    >
      <UIcon
        v-if="item.icon"
        :name="(item.icon as string)"
        class="size-4 shrink-0"
      />
      <span class="truncate">{{ item.title }}</span>
    </ULink>
    <div
      v-else
      :class="[itemClasses, headerClasses, 'cursor-default select-none']"
    >
      <UIcon
        v-if="item.icon"
        :name="(item.icon as string)"
        class="size-4 shrink-0"
      />
      <span class="truncate">{{ item.title }}</span>
    </div>
    <ul
      v-if="hasChildren"
      class="ml-3 mt-px flex flex-col border-l border-default pl-3"
    >
      <DocsAsideLeftBodyItem
        v-for="(child, index) in item.children"
        :key="index"
        :item="(child as ContentNavigationItem)"
        :level="level + 1"
      />
    </ul>
  </li>
</template>
