<script setup lang="ts">
/**
 * Properties of the selected layer.
 *
 * Geometry is in fractions of the stage rather than pixels, so a composition
 * survives a change of stage size instead of scattering — the same reason the
 * camera is expressed as a zoom rather than a distance.
 */

import type { Layer } from '~/utils/lab/layers'
import { ENTRIES } from '~/utils/lab/registry'

const props = defineProps<{ layer: Layer, timelineLength: number }>()

const emit = defineEmits<{
  update: [patch: Partial<Layer>]
  remove: []
  duplicate: []
}>()

const FONTS = [
  { value: 'pixel', label: 'pixel' },
  { value: 'sans', label: 'sans' },
  { value: 'mono', label: 'mono' },
] as const

/**
 * Ceiling for a clip's own span.
 *
 * Deliberately not the timeline's length: the timeline is derived from the
 * clips, so capping a clip at it means a clip can only ever shrink. There would
 * be no value left to type that makes it longer.
 */
const MAX_SPAN = 120_000

const SPACES = [
  { value: 'plate', label: 'on plate', hint: 'Sits on the animation and takes its tilt' },
  { value: 'scene', label: 'in scene', hint: 'Floats at its own depth' },
  { value: 'overlay', label: 'overlay', hint: 'Flat on the frame, outside the camera' },
] as const

const groupedEntries = computed(() => {
  const groups = new Map<string, typeof ENTRIES>()
  for (const entry of ENTRIES) {
    const list = groups.get(entry.group) ?? []
    list.push(entry)
    groups.set(entry.group, list)
  }
  return Array.from(groups, ([group, entries]) => ({ group, entries }))
})

const ALIGNMENTS = [
  { value: 'left', icon: 'i-lucide-align-left' },
  { value: 'center', icon: 'i-lucide-align-center' },
  { value: 'right', icon: 'i-lucide-align-right' },
] as const
</script>

<template>
  <LabSection title="Layer">
    <input
      :value="layer.name"
      type="text"
      class="mb-2 w-full border border-zinc-800 bg-zinc-900/40 px-2 py-1.5 font-mono text-[11px] text-zinc-200 outline-none focus:border-zinc-600"
      @input="emit('update', { name: ($event.target as HTMLInputElement).value })"
    >

    <!--
      Which built-in animation this layer stages. It lives here rather than in a
      global Source section because a project can hold several, or none.
    -->
    <select
      v-if="layer.kind === 'component'"
      :value="layer.component"
      class="mb-2 w-full border border-zinc-800 bg-zinc-900/40 px-2 py-1.5 font-mono text-[11px] text-zinc-200 outline-none focus:border-zinc-600"
      @change="emit('update', {
        component: ($event.target as HTMLSelectElement).value,
        name: ($event.target as HTMLSelectElement).value,
      })"
    >
      <optgroup v-for="group in groupedEntries" :key="group.group" :label="group.group">
        <option v-for="entry in group.entries" :key="entry.name" :value="entry.name">
          {{ entry.label }}
        </option>
      </optgroup>
    </select>

    <template v-if="layer.kind === 'text'">
      <textarea
        :value="layer.text"
        rows="2"
        class="mb-2 w-full resize-none border border-zinc-800 bg-zinc-900/40 px-2 py-1.5 font-mono text-[11px] text-zinc-200 outline-none focus:border-zinc-600"
        @input="emit('update', { text: ($event.target as HTMLTextAreaElement).value })"
      />

      <div class="mb-2 flex gap-1">
        <button
          v-for="font in FONTS"
          :key="font.value"
          type="button"
          class="flex-1 border py-1 font-mono text-[10px] transition-colors"
          :class="(layer.font ?? 'pixel') === font.value
            ? 'border-blue-500/60 text-blue-300'
            : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'"
          @click="emit('update', { font: font.value })"
        >
          {{ font.label }}
        </button>
      </div>

      <div class="mb-2 flex items-center gap-1">
        <button
          v-for="alignment in ALIGNMENTS"
          :key="alignment.value"
          type="button"
          class="flex flex-1 items-center justify-center border py-1 transition-colors"
          :class="(layer.align ?? 'center') === alignment.value
            ? 'border-blue-500/60 text-blue-300'
            : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'"
          @click="emit('update', { align: alignment.value })"
        >
          <UIcon :name="alignment.icon" class="size-3" />
        </button>
        <input
          :value="layer.color ?? '#ffffff'"
          type="color"
          class="h-6 w-12 shrink-0 cursor-pointer border border-zinc-800 bg-transparent"
          @input="emit('update', { color: ($event.target as HTMLInputElement).value })"
        >
      </div>

      <LabNumber
        :model-value="layer.fontSize ?? 0.12"
        label="Size"
        :min="0.01"
        :max="0.6"
        :step="0.002"
        :default="0.12"
        @update:model-value="emit('update', { fontSize: $event })"
      />
      <LabNumber
        :model-value="layer.weight ?? 500"
        label="Weight"
        :min="100"
        :max="900"
        :step="100"
        :default="500"
        @update:model-value="emit('update', { weight: $event })"
      />
    </template>

    <!--
      Where the layer lives. Plate rides on the animation's surface and takes its
      tilt; scene floats at its own depth; overlay skips the camera entirely.
    -->
    <div class="mb-2 flex gap-1">
      <button
        v-for="space in SPACES"
        :key="space.value"
        type="button"
        class="flex-1 border py-1 font-mono text-[10px] transition-colors"
        :class="(layer.space ?? 'scene') === space.value
          ? 'border-blue-500/60 text-blue-300'
          : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'"
        :title="space.hint"
        @click="emit('update', { space: space.value })"
      >
        {{ space.label }}
      </button>
    </div>

    <LabNumber
      :model-value="layer.x"
      label="X"
      :min="-0.5"
      :max="1.5"
      :step="0.002"
      :default="0.5"
      @update:model-value="emit('update', { x: $event })"
    />
    <LabNumber
      :model-value="layer.y"
      label="Y"
      :min="-0.5"
      :max="1.5"
      :step="0.002"
      :default="0.5"
      @update:model-value="emit('update', { y: $event })"
    />
    <LabNumber
      v-if="(layer.space ?? 'scene') === 'scene'"
      :model-value="layer.depth"
      label="Depth"
      :min="-2"
      :max="2"
      :step="0.005"
      :default="-0.35"
      @update:model-value="emit('update', { depth: $event })"
    />
    <LabNumber
      :model-value="layer.width"
      label="Width"
      :min="0.02"
      :max="2"
      :step="0.002"
      :default="0.5"
      @update:model-value="emit('update', { width: $event })"
    />
    <LabNumber
      :model-value="layer.rotation"
      label="Rotation"
      :min="-180"
      :max="180"
      :step="0.5"
      unit="°"
      :default="0"
      @update:model-value="emit('update', { rotation: $event })"
    />
    <LabNumber
      :model-value="layer.opacity"
      label="Opacity"
      :min="0"
      :max="1"
      :step="0.005"
      :default="1"
      @update:model-value="emit('update', { opacity: $event })"
    />

    <LabNumber
      :model-value="layer.start"
      label="Start"
      :min="0"
      :max="MAX_SPAN"
      :step="10"
      unit="ms"
      :default="0"
      @update:model-value="emit('update', { start: $event })"
    />
    <LabNumber
      :model-value="layer.duration"
      label="Length"
      :min="100"
      :max="MAX_SPAN"
      :step="10"
      unit="ms"
      :default="2000"
      @update:model-value="emit('update', { duration: $event })"
    />
    <LabEffects
      :effects="layer.effects ?? []"
      empty-label="No animation — the media cuts in and out."
      @update="emit('update', { effects: $event })"
    />

    <div class="mt-2 flex gap-1">
      <button
        type="button"
        class="flex-1 border border-zinc-800 py-1.5 font-mono text-[10px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
        @click="emit('duplicate')"
      >
        duplicate
      </button>
      <button
        type="button"
        class="flex-1 border border-zinc-800 py-1.5 font-mono text-[10px] text-zinc-400 transition-colors hover:border-red-900 hover:text-red-300"
        @click="emit('remove')"
      >
        delete
      </button>
    </div>
  </LabSection>
</template>
