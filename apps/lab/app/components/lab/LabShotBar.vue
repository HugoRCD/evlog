<script setup lang="ts">
/**
 * What stands in for the timeline when the document is a single frame.
 *
 * A shot has no spans to lay out, so a track view would be one clip stretched
 * across a ruler nobody can use. What is left of the timeline's job is still
 * real, though: somewhere to put a layer, somewhere to see the ones already
 * there, and — for a staged component, which is an animation whether or not the
 * document is — a way to say which instant is being photographed.
 *
 * So this is the timeline minus time, and it is deliberately one row: a shot
 * that needs a second row of chrome is a shot that should have been a take.
 */
import type { Layer } from '~/utils/lab/layers'

defineProps<{
  layers: Layer[]
  selectedId: string | null
  /** Where in the staged animation the frame is taken, in ms. */
  moment: number
  length: number
  /** False when nothing on the frame animates, which makes the instant moot. */
  hasComponent: boolean
}>()

const emit = defineEmits<{
  seek: [ms: number]
  select: [id: string | null]
  addText: []
  addImage: []
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
  <div class="flex shrink-0 items-center gap-3 border-t border-default px-3 py-2">
    <!--
      The instant, and only when something moves. On a shot made of a photo and
      a caption there is no animation to scrub, and a slider that changes
      nothing is a control that teaches you to distrust the panel.
    -->
    <div v-if="hasComponent" class="flex min-w-0 flex-1 items-center gap-2">
      <span class="shrink-0 font-mono text-[10px] text-dimmed">instant</span>
      <input
        type="range"
        min="0"
        :max="length"
        step="1"
        :value="moment"
        class="min-w-0 flex-1 accent-primary"
        @input="emit('seek', Number(($event.target as HTMLInputElement).value))"
      >
      <span class="shrink-0 font-mono text-[10px] tabular-nums text-dimmed">
        {{ (moment / 1000).toFixed(2) }}s
      </span>
    </div>
    <div v-else class="min-w-0 flex-1 font-mono text-[10px] text-dimmed/70">
      Nothing on this frame animates.
    </div>

    <!--
      The layers, as chips rather than as tracks. Order is stacking order, which
      is the only thing left of what a track was telling you.
    -->
    <div class="flex shrink-0 items-center gap-1 overflow-x-auto">
      <button
        v-for="layer in layers"
        :key="layer.id"
        type="button"
        data-cuelume-press
        class="flex shrink-0 items-center gap-1.5 border px-2 py-1 transition-colors"
        :class="selectedId === layer.id
          ? 'border-primary-500/60 text-primary'
          : 'border-muted text-dimmed hover:border-accented hover:text-toned'"
        @click="emit('select', selectedId === layer.id ? null : layer.id)"
      >
        <UIcon :name="KIND_ICON[layer.kind] ?? 'i-lucide-square'" class="size-3 shrink-0" />
        <span class="max-w-24 truncate font-mono text-[10px]">{{ layer.name }}</span>
        <UIcon
          v-if="selectedId === layer.id"
          name="i-lucide-x"
          class="size-3 shrink-0 hover:text-error"
          @click.stop="emit('remove', layer.id)"
        />
      </button>
    </div>

    <div class="flex shrink-0 items-center gap-1">
      <button
        type="button"
        data-cuelume-press
        class="border border-muted px-2 py-1 font-mono text-[10px] text-muted transition-colors hover:border-accented hover:text-default"
        @click="emit('addImage')"
      >
        + media
      </button>
      <button
        type="button"
        data-cuelume-press
        class="border border-muted px-2 py-1 font-mono text-[10px] text-muted transition-colors hover:border-accented hover:text-default"
        @click="emit('addText')"
      >
        + text
      </button>
    </div>
  </div>
</template>
