<script lang="ts">
/**
 * A named set of choices.
 *
 * The panel had four rows of bare chips — `24 30 60`, `0.25× 0.5× 1× 2×`,
 * `16:9 1:1 4:5` — sitting under whatever slider happened to precede them. A
 * row of numbers with nothing naming it is a riddle: you could see the options
 * and not what they were options *for*. So every set states what it sets, and
 * where the choice needs a sentence it gets one, once, instead of a tooltip per
 * chip.
 *
 * Presets rather than a range is the other half of it. These are values with a
 * right answer — a delivery size, a frame rate — and a slider through them
 * offers a thousand wrong ones to find the six that are meant.
 */
export interface LabChoiceOption {
  value: string | number
  label: string
  /** Second line: the concrete consequence, e.g. the pixel size behind a name. */
  note?: string
  /** Why you would pick this one, on hover. */
  title?: string
}
</script>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  label: string
  options: readonly LabChoiceOption[]
  /** The chosen value, or undefined when the setting sits outside the set. */
  modelValue?: string | number
  /** One line under the label, for a choice whose name is not enough. */
  hint?: string
  /**
   * Two lines per option rather than one. Cards carry a note and read as a list
   * of destinations; chips are for short values that scan as a scale.
   */
  cards?: boolean
}>(), { cards: false })

const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()

/**
 * Whether the value in force is one of the offered ones.
 *
 * A shot can arrive from a link holding 45fps or a 1234-wide frame, and a row of
 * chips with none of them lit says "nothing is set" when something certainly is.
 */
const matched = computed(() => props.options.some(option => option.value === props.modelValue))
</script>

<template>
  <div class="mb-2">
    <div class="mb-1 flex items-baseline justify-between gap-2">
      <span class="font-mono text-[11px] text-muted">{{ label }}</span>
      <!--
        What the setting is right now, for the case the presets cannot show: a
        size out of a shared link matches no card, and without this the row would
        claim nothing is set.
      -->
      <span v-if="!matched" class="shrink-0 font-mono text-[9px] text-dimmed/70">custom</span>
    </div>

    <p v-if="hint" class="mb-1.5 font-mono text-[10px] leading-snug text-dimmed/70">
      {{ hint }}
    </p>

    <!--
      Cards take a grid, chips take a wrapping row.
      A fixed column count has to be chosen per option count — three rates fit a
      three-across grid and four speeds leave an orphan in it. Letting chips grow
      to fill the row and wrap when they cannot means one layout serves both.
    -->
    <div class="gap-1" :class="cards ? 'grid grid-cols-1 @min-[300px]:grid-cols-2' : 'flex flex-wrap'">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        data-cuelume-press
        class="border px-2 transition-colors"
        :class="[
          cards ? 'py-1.5 text-left' : 'min-w-14 flex-1 py-[5px] text-center',
          modelValue === option.value
            ? 'border-primary-500/60 text-primary'
            : 'border-muted text-dimmed hover:border-accented hover:text-toned',
        ]"
        :title="option.title"
        @click="emit('update:modelValue', option.value)"
      >
        <span class="block truncate font-mono text-[10px] leading-tight">{{ option.label }}</span>
        <span
          v-if="option.note"
          class="mt-0.5 block truncate font-mono text-[9px] leading-tight"
          :class="modelValue === option.value ? 'text-primary/60' : 'text-dimmed/70'"
        >
          {{ option.note }}
        </span>
      </button>
    </div>
  </div>
</template>
