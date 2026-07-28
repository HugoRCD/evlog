<script setup lang="ts">
/**
 * The effect list for one subject — a layer, or the shot itself.
 *
 * Shared because a travelling and an entrance are the same thing pointed at
 * different targets: a ramp from a displaced state into a resting one. Keeping
 * one editor means a curve added for titles is immediately available to the
 * camera.
 */

import { EASING_NAMES, EFFECT_LIBRARY, createEffect } from '~/utils/lab/effects'
import type { EffectKind, LayerEffect } from '~/utils/lab/effects'

const props = defineProps<{
  effects: LayerEffect[]
  /** Shown when the list is empty, to say what nothing means here. */
  emptyLabel: string
}>()

const emit = defineEmits<{ update: [effects: LayerEffect[]] }>()

const adding = ref(false)

function descriptorFor(kind: EffectKind) {
  return EFFECT_LIBRARY.find(entry => entry.kind === kind) ?? EFFECT_LIBRARY[0]!
}

function addEffect(kind: EffectKind, at: 'in' | 'out') {
  adding.value = false
  emit('update', [...props.effects, createEffect(kind, at)])
}

function patchEffect(index: number, patch: Partial<LayerEffect>) {
  emit('update', props.effects.map((effect, at) => (at === index ? { ...effect, ...patch } : effect)))
}

function removeEffect(index: number) {
  emit('update', props.effects.filter((_, at) => at !== index))
}

const DIRECTIONS = ['left', 'right', 'up', 'down'] as const
</script>

<template>
  <div>
    <!--
      Effects, in the order they were added. They compose, so a title can slide,
      fade and settle forward at once rather than picking one of the three.
    -->
    <div class="mt-3 mb-1 flex items-center justify-between">
      <span class="font-pixel text-[10px] uppercase tracking-[0.18em] text-zinc-500">Animation</span>
      <button
        type="button"
        class="font-mono text-[10px] text-zinc-500 transition-colors hover:text-zinc-200"
        @click="adding = !adding"
      >
        {{ adding ? 'close' : '+ add' }}
      </button>
    </div>

    <div v-if="adding" class="mb-2 border border-zinc-800 bg-zinc-900/40 p-1.5">
      <div v-for="at in (['in', 'out'] as const)" :key="at" class="mb-1 last:mb-0">
        <span class="mb-1 block font-mono text-[9px] uppercase tracking-wider text-zinc-600">{{ at }}</span>
        <div class="grid grid-cols-3 gap-1">
          <button
            v-for="descriptor in EFFECT_LIBRARY"
            :key="descriptor.kind"
            type="button"
            class="border border-zinc-800 py-1 font-mono text-[10px] text-zinc-400 transition-colors hover:border-blue-500/50 hover:text-blue-300"
            @click="addEffect(descriptor.kind, at)"
          >
            {{ descriptor.label }}
          </button>
        </div>
      </div>
    </div>

    <p v-if="!effects.length" class="mb-2 font-mono text-[10px] leading-relaxed text-zinc-600">
      {{ emptyLabel }}
    </p>

    <div
      v-for="(effect, index) in effects"
      :key="`${effect.kind}-${index}`"
      class="mb-1.5 border border-zinc-800/80 bg-zinc-900/30 p-1.5"
    >
      <div class="mb-1 flex items-center justify-between">
        <span class="font-mono text-[10px] text-zinc-300">
          {{ descriptorFor(effect.kind).label }}
          <span class="text-zinc-600">{{ effect.at }}</span>
        </span>
        <button
          type="button"
          class="font-mono text-[10px] text-zinc-600 transition-colors hover:text-red-400"
          @click="removeEffect(index)"
        >
          ×
        </button>
      </div>

      <LabNumber
        :model-value="effect.duration"
        label="Duration"
        :min="30"
        :max="4000"
        :step="10"
        unit="ms"
        :default="600"
        @update:model-value="patchEffect(index, { duration: $event })"
      />
      <LabNumber
        :model-value="effect.amount"
        :label="descriptorFor(effect.kind).amountLabel"
        v-bind="descriptorFor(effect.kind).amountRange"
        :default="descriptorFor(effect.kind).defaultAmount"
        @update:model-value="patchEffect(index, { amount: $event })"
      />

      <div class="mt-1 flex flex-wrap gap-1">
        <button
          v-for="easing in EASING_NAMES"
          :key="easing"
          type="button"
          class="border px-1.5 py-0.5 font-mono text-[9px] transition-colors"
          :class="effect.easing === easing
            ? 'border-blue-500/60 text-blue-300'
            : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'"
          @click="patchEffect(index, { easing })"
        >
          {{ easing }}
        </button>
      </div>

      <div v-if="descriptorFor(effect.kind).hasDirection" class="mt-1 flex gap-1">
        <button
          v-for="direction in DIRECTIONS"
          :key="direction"
          type="button"
          class="flex-1 border py-0.5 font-mono text-[9px] transition-colors"
          :class="effect.direction === direction
            ? 'border-blue-500/60 text-blue-300'
            : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'"
          @click="patchEffect(index, { direction })"
        >
          {{ direction }}
        </button>
      </div>
    </div>
  </div>
</template>
