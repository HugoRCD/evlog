<script setup lang="ts">
import { DEFAULT_SETTINGS, FORMATS, HINTS, PRESETS, RANGES, frameCountFor, outputDuration } from '~/utils/lab/settings'
import type { LabSettings, RangedKey } from '~/utils/lab/settings'
import type { Layer } from '~/utils/lab/layers'
import type { LayerEffect } from '~/utils/lab/effects'

defineProps<{
  /** Set while a video export is running; blocks anything that would change the frame. */
  busy: boolean
  progress: number
  /** False when the driver refused half-float targets, which flattens bloom. */
  highPrecision: boolean
  captureMs: number
  /** Briefly true after a share link is copied. */
  linkCopied: boolean
  selectedLayer: Layer | null
}>()

const emit = defineEmits<{
  preset: [name: string]
  fit: []
  fitStage: []
  replay: []
  exportVideo: []
  exportPng: []
  copyLink: []
  resetSettings: []
  resetEverything: []
  cancel: []
  updateLayer: [id: string, patch: Partial<Layer>]
  removeLayer: []
  duplicateLayer: []
}>()

const settings = defineModel<LabSettings>('settings', { required: true })
const showSource = defineModel<boolean>('showSource', { required: true })
const picking = defineModel<boolean>('picking', { required: true })
const camera = defineModel<LayerEffect[]>('camera', { required: true })

/**
 * Bind a control to the shared range table, plus the value it resets to.
 *
 * Sourcing both from one place means a control cannot drift from what the
 * renderer will actually accept.
 */
function range(key: RangedKey) {
  return { ...RANGES[key], default: DEFAULT_SETTINGS[key] as number, hint: HINTS[key] }
}

const activeFormat = computed(() =>
  FORMATS.find(format => format.width === settings.value.outputWidth && format.height === settings.value.outputHeight)?.label ?? null,
)

function setFormat(format: typeof FORMATS[number]) {
  settings.value.outputWidth = format.width
  settings.value.outputHeight = format.height
}

// Clearing throws away imported media, so it asks once rather than acting on a
// stray click next to the reset it sits beside.
const confirmingReset = ref(false)

const frameCount = computed(() => frameCountFor(settings.value))
const outputSeconds = computed(() => (outputDuration(settings.value) / 1000).toFixed(1))
const segmentSeconds = computed(() => (settings.value.timelineLength / 1000).toFixed(1))

/**
 * Depth of field needs the plate to be tilted: a flat surface parallel to the
 * sensor is uniformly in focus, so the focus controls genuinely do nothing until
 * there is some rotation. Worth saying outright rather than letting it read as
 * a broken slider.
 */
const hasDepth = computed(() =>
  Math.abs(settings.value.pitch) > 0.5 || Math.abs(settings.value.yaw) > 0.5,
)

const SPEEDS = [0.25, 0.5, 1, 1.5, 2] as const

const CONTAINERS = [
  { value: 'mp4', label: 'mp4 · h.264' },
  { value: 'webm', label: 'webm · vp9' },
] as const
</script>

<template>
  <aside class="flex h-full w-[290px] shrink-0 flex-col border-l border-zinc-900 bg-black">
    <header class="flex items-center justify-between border-b border-zinc-900 px-4 py-3">
      <span class="font-pixel text-[11px] uppercase tracking-[0.2em] text-zinc-200">Render lab</span>
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="font-mono text-[10px] text-zinc-600 transition-colors hover:text-zinc-300"
          title="Restore every setting to its default. The component and the layers are kept."
          @click="emit('resetSettings')"
        >
          reset
        </button>
        <button
          type="button"
          class="font-mono text-[10px] text-zinc-700 transition-colors hover:text-red-400"
          title="Reset the settings and remove every layer."
          @click="confirmingReset ? emit('resetEverything') : (confirmingReset = true)"
          @blur="confirmingReset = false"
        >
          {{ confirmingReset ? 'sure?' : 'clear' }}
        </button>
        <button
          type="button"
          class="font-mono text-[10px] transition-colors"
          :class="linkCopied ? 'text-blue-300' : 'text-zinc-600 hover:text-zinc-300'"
          @click="emit('copyLink')"
        >
          {{ linkCopied ? 'copied' : 'copy link' }}
        </button>
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <LabLayerProps
        v-if="selectedLayer"
        :layer="selectedLayer"
        :timeline-length="settings.timelineLength"
        @update="emit('updateLayer', selectedLayer.id, $event)"
        @remove="emit('removeLayer')"
        @duplicate="emit('duplicateLayer')"
      />

      <LabSection title="Stage">
        <LabNumber v-model="settings.stageWidth" label="Stage width" v-bind="range('stageWidth')" />
        <LabNumber v-model="settings.stageHeight" label="Stage height" v-bind="range('stageHeight')" />
        <LabNumber v-model="settings.plateScale" label="Plate detail" v-bind="range('plateScale')" />
        <LabToggle v-model="showSource" label="Show raw stage" />

        <div class="mt-2 flex gap-1">
          <button
            type="button"
            class="flex-1 border border-zinc-800 py-[5px] font-mono text-[10px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 transition-colors"
            @click="emit('replay')"
          >
            replay
          </button>
          <button
            type="button"
            class="flex-1 border border-zinc-800 py-[5px] font-mono text-[10px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 transition-colors"
            @click="emit('fitStage')"
          >
            fit stage
          </button>
          <button
            type="button"
            class="flex-1 border border-zinc-800 py-[5px] font-mono text-[10px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 transition-colors"
            @click="emit('fit')"
          >
            reset cam
          </button>
        </div>
      </LabSection>

      <LabSection title="Look">
        <div class="grid grid-cols-2 gap-1">
          <button
            v-for="(_, name) in PRESETS"
            :key="name"
            type="button"
            class="border border-zinc-800 py-[6px] font-mono text-[10px] text-zinc-400 hover:border-blue-500/50 hover:text-blue-300 transition-colors"
            @click="emit('preset', name)"
          >
            {{ name }}
          </button>
        </div>
      </LabSection>

      <LabSection title="Camera">
        <LabNumber v-model="settings.pitch" label="Pitch" v-bind="range('pitch')" />
        <LabNumber v-model="settings.yaw" label="Yaw" v-bind="range('yaw')" />
        <LabNumber v-model="settings.roll" label="Roll" v-bind="range('roll')" />
        <LabNumber v-model="settings.zoom" label="Zoom" v-bind="range('zoom')" />
        <LabNumber v-model="settings.fov" label="Field of view" v-bind="range('fov')" />
        <LabNumber v-model="settings.panX" label="Pan X" v-bind="range('panX')" />
        <LabNumber v-model="settings.panY" label="Pan Y" v-bind="range('panY')" />

        <!--
          Moves on the shot rather than on a layer: dolly travels, slide pans,
          spin rolls, fade takes the frame to black.
        -->
        <div class="mt-3 mb-1 font-pixel text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          Moves
        </div>
        <LabEffects
          :effects="camera"
          empty-label="No moves — the camera holds."
          @update="camera = $event"
        />
      </LabSection>

      <LabSection title="Focus">
        <div class="flex items-center gap-1">
          <div class="min-w-0 flex-1">
            <LabNumber v-model="settings.focus" label="Focal plane" v-bind="range('focus')" />
          </div>
          <button
            type="button"
            class="shrink-0 border p-[5px] transition-colors"
            :class="picking
              ? 'border-blue-500/60 text-blue-300'
              : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'"
            title="Pick the focal plane by clicking the frame"
            @click="picking = !picking"
          >
            <UIcon name="i-lucide-crosshair" class="block size-3" />
          </button>
        </div>
        <LabNumber v-model="settings.focusRange" label="Sharp band" v-bind="range('focusRange')" />
        <LabNumber v-model="settings.aperture" label="Bokeh strength" v-bind="range('aperture')" />
        <LabNumber v-model="settings.blurRadius" label="Max blur" v-bind="range('blurRadius')" />
        <LabNumber v-model="settings.dofSamples" label="Bokeh samples" v-bind="range('dofSamples')" />

        <p v-if="!hasDepth" class="mt-2 font-mono text-[10px] leading-relaxed text-amber-500/70">
          The plate faces the camera square-on, so every point of it is the same
          distance away and there is nothing to focus through. Add pitch or yaw.
        </p>
      </LabSection>

      <LabSection title="Bloom">
        <LabNumber v-model="settings.bloomIntensity" label="Intensity" v-bind="range('bloomIntensity')" />
        <LabNumber v-model="settings.bloomThreshold" label="Threshold" v-bind="range('bloomThreshold')" />
        <LabNumber v-model="settings.bloomKnee" label="Knee" v-bind="range('bloomKnee')" />
        <LabNumber v-model="settings.bloomRadius" label="Radius" v-bind="range('bloomRadius')" />
      </LabSection>

      <LabSection title="Grade">
        <LabNumber v-model="settings.emission" label="Plate emission" v-bind="range('emission')" />
        <LabNumber v-model="settings.exposure" label="Exposure" v-bind="range('exposure')" />
        <LabNumber v-model="settings.contrast" label="Contrast" v-bind="range('contrast')" />
        <LabNumber v-model="settings.saturation" label="Saturation" v-bind="range('saturation')" />
        <LabNumber v-model="settings.attenuation" label="Distance falloff" v-bind="range('attenuation')" />
        <LabNumber v-model="settings.aberration" label="Chromatic aberration" v-bind="range('aberration')" />
        <LabNumber v-model="settings.vignette" label="Vignette" v-bind="range('vignette')" />
        <LabNumber v-model="settings.grain" label="Grain" v-bind="range('grain')" />
        <LabToggle v-model="settings.tonemap" label="Filmic tonemap" />

        <div class="mt-2 flex items-center justify-between gap-3">
          <span class="font-mono text-[11px] text-zinc-500">Background</span>
          <input
            v-model="settings.background"
            type="color"
            class="h-[22px] w-[104px] cursor-pointer border border-zinc-800 bg-transparent"
          >
        </div>
      </LabSection>

      <LabSection title="Output">
        <div class="mb-2 grid grid-cols-5 gap-1">
          <button
            v-for="format in FORMATS"
            :key="format.label"
            type="button"
            class="border py-[5px] font-mono text-[9px] transition-colors"
            :class="activeFormat === format.label
              ? 'border-blue-500/60 text-blue-300'
              : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'"
            @click="setFormat(format)"
          >
            {{ format.label }}
          </button>
        </div>

        <LabNumber v-model="settings.outputWidth" label="Width" v-bind="range('outputWidth')" />
        <LabNumber v-model="settings.outputHeight" label="Height" v-bind="range('outputHeight')" />
        <LabNumber v-model="settings.tail" label="Tail" v-bind="range('tail')" />
        <LabNumber v-model="settings.fps" label="Frame rate" v-bind="range('fps')" />
        <LabNumber v-model="settings.speed" label="Playback speed" v-bind="range('speed')" />

        <div class="mt-1 grid grid-cols-5 gap-1">
          <button
            v-for="preset in SPEEDS"
            :key="preset"
            type="button"
            class="border py-[5px] font-mono text-[9px] transition-colors"
            :class="Math.abs(settings.speed - preset) < 0.001
              ? 'border-blue-500/60 text-blue-300'
              : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'"
            @click="settings.speed = preset"
          >
            {{ preset }}×
          </button>
        </div>

        <div class="mt-2 flex gap-1">
          <button
            v-for="format in CONTAINERS"
            :key="format.value"
            type="button"
            class="flex-1 border py-[5px] font-mono text-[10px] transition-colors"
            :class="settings.container === format.value
              ? 'border-blue-500/60 text-blue-300'
              : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'"
            @click="settings.container = format.value"
          >
            {{ format.label }}
          </button>
        </div>

        <p class="mt-2 font-mono text-[10px] leading-relaxed text-zinc-600">
          {{ frameCount }} frames · {{ segmentSeconds }}s of animation → {{ outputSeconds }}s of video
        </p>
      </LabSection>
    </div>

    <footer class="border-t border-zinc-900 p-4">
      <div v-if="busy" class="mb-2">
        <!--
          scaleX rather than an animated width. A width transition is a layout
          animation driven by the main thread — which spends the whole export
          blocked in long synchronous captures, so the bar lurches and appears to
          slip backwards. A transform is composited and set outright, so it only
          ever moves forward, at exactly the rate progress does.
        -->
        <div class="h-[3px] w-full overflow-hidden bg-zinc-900">
          <div
            class="h-full origin-left bg-blue-500"
            :style="{ transform: `scaleX(${progress})` }"
          />
        </div>
        <div class="mt-2 flex items-center justify-between">
          <span class="font-mono text-[10px] text-zinc-500">{{ Math.round(progress * 100) }}%</span>
          <button
            type="button"
            class="font-mono text-[10px] text-zinc-500 hover:text-red-400 transition-colors"
            @click="emit('cancel')"
          >
            cancel
          </button>
        </div>
      </div>

      <div v-else class="flex gap-1">
        <button
          type="button"
          class="flex-1 border border-blue-500/50 bg-blue-500/10 py-[7px] font-mono text-[10px] text-blue-300 hover:bg-blue-500/20 transition-colors"
          @click="emit('exportVideo')"
        >
          export {{ settings.container }}
        </button>
        <button
          type="button"
          class="border border-zinc-800 px-3 py-[7px] font-mono text-[10px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 transition-colors"
          @click="emit('exportPng')"
        >
          png
        </button>
      </div>

      <p class="mt-3 font-mono text-[9px] leading-relaxed text-zinc-700">
        stage {{ captureMs.toFixed(0) }}ms<span v-if="!highPrecision"> · 8-bit targets, bloom will be flatter</span>
      </p>
    </footer>
  </aside>
</template>
