<script setup lang="ts">
import type { CommandPaletteItem } from '@nuxt/ui'

/**
 * Everything the toolbar can do, reachable from the keyboard.
 *
 * The toolbar is four selects and a row of tabs — fine when you know where a
 * control is, slow when you know what you want. Typing "github" and pressing
 * enter to scope the whole dashboard to Actions runs is the shape this data
 * wants to be queried in, and it costs no new server work: every option here
 * is already in the stats response.
 */
const props = defineProps<{
  tabs: { value: string, label: string, icon: string }[]
  ranges: { value: string, label: string }[]
  tools: { label: string, value: string }[]
  environments: { label: string, value: string }[]
  sources: { label: string, value: string, icon?: string }[]
  /** What the dashboard is currently showing, so the palette can mark it. */
  current: {
    tab: string
    range: string
    tool: string
    environment: string
    source: string
  }
}>()

const emit = defineEmits<{
  'update:tab': [value: string]
  'update:range': [value: string]
  'update:tool': [value: string]
  'update:environment': [value: string]
  'update:source': [value: string]
  'reset': []
}>()

const open = defineModel<boolean>('open', { default: false })

/**
 * The palette's own search box. Held here rather than left to the component so
 * it can be emptied on every open — reopening to a list still filtered by what
 * you typed last time hides most of the commands and reads as broken.
 */
const term = ref('')

watch(open, (isOpen) => {
  if (isOpen) term.value = ''
})

defineShortcuts({
  meta_k: () => {
    open.value = !open.value
  },
})

function pick(run: () => void) {
  run()
  open.value = false
}

/** Marks the option the dashboard is on, so the palette shows state as well as offering actions. */
function selected(value: string, active: string) {
  return { active: value === active }
}

const groups = computed(() => [
  {
    id: 'go',
    label: 'Go to',
    items: props.tabs.map<CommandPaletteItem>(tab => ({
      label: tab.label,
      icon: tab.icon,
      ...selected(tab.value, props.current.tab),
      onSelect: () => pick(() => emit('update:tab', tab.value)),
    })),
  },
  {
    id: 'range',
    label: 'Time range',
    items: props.ranges.map<CommandPaletteItem>(range => ({
      label: range.label,
      icon: 'i-nucleo-calendar',
      ...selected(range.value, props.current.range),
      onSelect: () => pick(() => emit('update:range', range.value)),
    })),
  },
  {
    id: 'source',
    label: 'Source',
    items: props.sources.map<CommandPaletteItem>(source => ({
      label: source.label,
      icon: source.icon ?? 'i-nucleo-connect',
      ...selected(source.value, props.current.source),
      onSelect: () => pick(() => emit('update:source', source.value)),
    })),
  },
  {
    id: 'tool',
    label: 'Tool',
    items: props.tools.map<CommandPaletteItem>(tool => ({
      label: tool.label,
      icon: 'i-nucleo-box',
      ...selected(tool.value, props.current.tool),
      onSelect: () => pick(() => emit('update:tool', tool.value)),
    })),
  },
  {
    id: 'environment',
    label: 'Environment',
    items: props.environments.map<CommandPaletteItem>(environment => ({
      label: environment.label,
      icon: 'i-nucleo-rocket',
      ...selected(environment.value, props.current.environment),
      onSelect: () => pick(() => emit('update:environment', environment.value)),
    })),
  },
  {
    id: 'actions',
    label: 'Actions',
    items: [
      {
        label: 'Reset all filters',
        icon: 'i-nucleo-refresh',
        onSelect: () => pick(() => emit('reset')),
      }
    ],
  },
])
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: 'max-w-xl' }">
    <template #content>
      <UCommandPalette
        v-model:search-term="term"
        :groups
        placeholder="Jump to a view, or filter by anything…"
        class="h-80"
      >
        <template #item-trailing="{ item }">
          <UIcon v-if="(item as { active?: boolean }).active" name="i-nucleo-check" class="size-3.5 text-primary" />
        </template>
      </UCommandPalette>
    </template>
  </UModal>
</template>
