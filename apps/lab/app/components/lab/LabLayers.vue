<script setup lang="ts">
/**
 * The layer stack, in both kinds of document.
 *
 * A take had tracks and a shot had a row of chips, which meant the same list of
 * things existed twice in two vocabularies — and neither could say the one thing
 * a stack is for: what is on top of what, and what is currently in the way.
 *
 * Stacking order is the list, read the way a stack is drawn: the top row is the
 * layer in front. That is the reverse of the array, because the renderer draws
 * in order and the last one drawn wins.
 */
import type { Layer } from '~/utils/lab/layers'

defineProps<{
  layers: Layer[]
  selectedId: string | null
}>()

const emit = defineEmits<{
  select: [id: string | null]
  update: [id: string, patch: Partial<Layer>]
  reorder: [id: string, direction: -1 | 1]
  remove: [id: string]
}>()

const KIND_ICON: Record<string, string> = {
  text: 'i-lucide-type',
  image: 'i-lucide-image',
  video: 'i-lucide-film',
  component: 'i-lucide-square-play',
}
</script>

<template>
  <div>
    <p v-if="!layers.length" class="font-mono text-[10px] leading-relaxed text-dimmed/70">
      Nothing on the frame yet. Drop an image on it, or add one below.
    </p>

    <div v-else class="flex flex-col">
      <!--
        Reversed, so the row at the top of the list is the layer at the front of
        the picture. A stack drawn bottom-up reads as an execution order rather
        than as a composition, and nobody composes by thinking about draw calls.
      -->
      <div
        v-for="(layer, index) in [...layers].reverse()"
        :key="layer.id"
        class="group flex items-center gap-1.5 border-b border-default py-1 pr-1 transition-colors"
        :class="selectedId === layer.id ? 'text-primary' : 'text-dimmed hover:text-toned'"
      >
        <!--
          Hiding is not an opacity of zero. It is a thing you do to see what is
          behind, so it has to come back without remembering what the opacity
          was — and it stays legible in the list rather than looking deleted.
        -->
        <button
          type="button"
          data-cuelume-toggle
          class="flex size-5 shrink-0 items-center justify-center transition-colors hover:text-primary"
          :class="layer.hidden ? 'text-dimmed/50' : ''"
          :aria-label="layer.hidden ? `Show ${layer.name}` : `Hide ${layer.name}`"
          :title="layer.hidden ? 'Hidden — click to show' : 'Visible — click to hide'"
          @click="emit('update', layer.id, { hidden: !layer.hidden })"
        >
          <UIcon :name="layer.hidden ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-3" />
        </button>

        <button
          type="button"
          data-cuelume-press
          class="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left"
          @click="emit('select', selectedId === layer.id ? null : layer.id)"
        >
          <UIcon :name="KIND_ICON[layer.kind] ?? 'i-lucide-square'" class="size-3 shrink-0 opacity-70" />
          <span class="truncate font-mono text-[11px]" :class="layer.hidden ? 'line-through opacity-50' : ''">
            {{ layer.name }}
          </span>
        </button>

        <!--
          Only on the row being pointed at or worked on. Six controls per row on
          a five-layer shot is a wall of icons where the point was to see the
          list.
        -->
        <div
          class="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100"
          :class="selectedId === layer.id ? 'opacity-100' : ''"
        >
          <button
            type="button"
            data-cuelume-press
            class="flex size-5 items-center justify-center transition-colors hover:text-primary disabled:opacity-30 disabled:hover:text-current"
            :disabled="index === 0"
            aria-label="Bring forward"
            @click="emit('reorder', layer.id, 1)"
          >
            <UIcon name="i-lucide-chevron-up" class="size-3" />
          </button>
          <button
            type="button"
            data-cuelume-press
            class="flex size-5 items-center justify-center transition-colors hover:text-primary disabled:opacity-30 disabled:hover:text-current"
            :disabled="index === layers.length - 1"
            aria-label="Send backward"
            @click="emit('reorder', layer.id, -1)"
          >
            <UIcon name="i-lucide-chevron-down" class="size-3" />
          </button>
          <button
            type="button"
            data-cuelume-press
            class="flex size-5 items-center justify-center transition-colors hover:text-error"
            :aria-label="`Delete ${layer.name}`"
            @click="emit('remove', layer.id)"
          >
            <UIcon name="i-lucide-x" class="size-3" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
