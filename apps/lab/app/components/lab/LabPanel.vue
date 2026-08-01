<script setup lang="ts">
import type { LabMenuAction } from './LabMenu.vue'
import { DEFAULT_SETTINGS, FRAME_RATES, HINTS, OUTPUT_PRESETS, RANGES, SPEEDS, VIEWPORTS, frameCountFor, outputDuration } from '~/utils/lab/settings'
import type { LabSettings, RangedKey } from '~/utils/lab/settings'
import type { Layer } from '~/utils/lab/layers'
import type { LayerEffect } from '~/utils/lab/effects'

const props = defineProps<{
  /** Set while a video export is running; blocks anything that would change the frame. */
  busy: boolean
  progress: number
  /** False when the driver refused half-float targets, which flattens bloom. */
  highPrecision: boolean
  captureMs: number
  /** Briefly true after a share link is copied. */
  linkCopied: boolean
  selectedLayer: Layer | null
  /** Length the selected clip's animation declares, when it declares one. */
  sequenceMs?: number
  canUndo: boolean
  canRedo: boolean
}>()

const emit = defineEmits<{
  undo: []
  redo: []
  fit: []
  fitStage: []
  replay: []
  exportVideo: []
  exportPng: []
  copyLink: []
  projects: []
  shortcuts: []
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

/**
 * Presets as the only way in, and the size stated as the consequence.
 *
 * Width and height were two sliders that could disagree about the ratio, and
 * nobody shooting for a post wants to arrive at 1920 by pixel. A shot arriving
 * from an older link can still hold any size — it just matches no card, and the
 * choice reads as custom rather than as nothing.
 */
const OUTPUT_OPTIONS = OUTPUT_PRESETS.map(preset => ({
  value: preset.id,
  label: preset.label,
  note: `${preset.width}×${preset.height}`,
  title: preset.note,
}))

const activeOutput = computed(() =>
  OUTPUT_PRESETS.find(preset =>
    preset.width === settings.value.outputWidth && preset.height === settings.value.outputHeight,
  )?.id,
)

function setOutput(id: string) {
  const preset = OUTPUT_PRESETS.find(entry => entry.id === id)
  if (!preset) return
  settings.value.outputWidth = preset.width
  settings.value.outputHeight = preset.height
}

const VIEWPORT_OPTIONS = VIEWPORTS.map(viewport => ({
  value: viewport.id,
  label: viewport.label,
  note: `${viewport.width}×${viewport.height}`,
}))

const activeViewport = computed(() =>
  VIEWPORTS.find(viewport =>
    viewport.width === settings.value.stageWidth && viewport.height === settings.value.stageHeight,
  )?.id,
)

function setViewport(id: string) {
  const viewport = VIEWPORTS.find(entry => entry.id === id)
  if (!viewport) return
  settings.value.stageWidth = viewport.width
  settings.value.stageHeight = viewport.height
}

const RATE_OPTIONS = FRAME_RATES.map(rate => ({ value: rate, label: `${rate}fps` }))
const SPEED_OPTIONS = SPEEDS.map(speed => ({ value: speed, label: `${speed}×` }))

/** Icons per kind, so the tab says what sort of thing is selected at a glance. */
const KIND_ICON: Record<string, string> = {
  text: 'i-lucide-type',
  image: 'i-lucide-image',
  video: 'i-lucide-film',
  component: 'i-lucide-square-play',
}

const TABS = computed(() => [
  {
    value: 'layer' as const,
    label: props.selectedLayer?.name ?? 'Layer',
    icon: props.selectedLayer ? KIND_ICON[props.selectedLayer.kind] : undefined,
  },
  { value: 'shot' as const, label: 'Shot', icon: 'i-lucide-aperture' },
])

const activeTab = ref<'layer' | 'shot'>('shot')

// The tool's theme, which is not the document's — see `useLabTheme`. Nothing
// this button does can reach the stage, which is the one thing anyone would fear
// from a light switch in a room built for filming against black.
const { isDark, toggle: toggleTheme } = useLabTheme()

// Selecting a clip is a statement of intent: show what was just selected rather
// than leaving it to be found behind a tab.
watch(() => props.selectedLayer?.id, (id) => {
  activeTab.value = id ? 'layer' : 'shot'
})

/**
 * The panel's own housekeeping, behind one button.
 *
 * Clearing throws away imported media, so it asks once — inside the menu, where
 * there is room to say what it will take with it.
 */
const ACTIONS = computed<LabMenuAction[]>(() => [
  // Above the two destructive actions, and in the same menu as them on purpose:
  // this is the thing that makes "Clear everything" a decision rather than an
  // accident, so it should be visible from where that decision is taken.
  {
    label: 'Undo',
    icon: 'i-lucide-undo-2',
    hint: 'Step back. ⌘Z.',
    disabled: !props.canUndo,
    keepOpen: true,
    select: () => emit('undo'),
  },
  {
    label: 'Redo',
    icon: 'i-lucide-redo-2',
    hint: 'Step forward again. ⌘⇧Z.',
    disabled: !props.canRedo,
    keepOpen: true,
    select: () => emit('redo'),
  },
  {
    label: 'Projects',
    icon: 'i-lucide-folder-open',
    hint: 'Save, open, export. ⌘O.',
    select: () => emit('projects'),
  },
  {
    label: props.linkCopied ? 'Link copied' : 'Copy link',
    icon: props.linkCopied ? 'i-lucide-check' : 'i-lucide-link',
    hint: 'The whole shot, as a URL.',
    keepOpen: true,
    select: () => emit('copyLink'),
  },
  {
    label: 'Reset settings',
    icon: 'i-lucide-rotate-ccw',
    hint: 'Back to defaults. The layers are kept.',
    select: () => emit('resetSettings'),
  },
  {
    label: 'Clear everything',
    icon: 'i-lucide-trash-2',
    hint: 'Reset the settings and remove every layer.',
    danger: true,
    confirm: 'Clear it all — sure?',
    select: () => emit('resetEverything'),
  },
])

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

const CONTAINERS = [
  { value: 'mp4', label: 'mp4', note: 'h.264 · plays anywhere' },
  { value: 'webm', label: 'webm', note: 'vp9 · smaller file' },
] as const
</script>

<template>
  <!--
    A container, so the controls inside can answer the panel's width rather than
    the window's. This panel is dragged between 240 and 560 pixels: a five-across
    row of buttons that is comfortable at one end is unreadable at the other, and
    a media query cannot tell the difference because the window never changed.
  -->
  <!-- No left border: the splitter beside it is the divider. -->
  <aside class="@container flex h-full shrink-0 flex-col bg-default">
    <header class="flex items-center justify-between gap-2 border-b border-default px-3 py-3 @min-[280px]:px-4">
      <!--
        The title holds one line and gives up characters before it gives up the
        row. Wrapping "Render labs" onto two lines pushed the help button under
        the actions and made a tidy header look broken.
      -->
      <span class="min-w-0 truncate font-pixel text-[11px] uppercase tracking-[0.2em] text-default">
        Render labs
      </span>

      <div class="flex shrink-0 items-center gap-1">
        <!--
          Out of the menu and into the header. Behind the ellipsis, saving your
          work was three characters wide and looked like a preference — the one
          action in the app that decides whether anything survives the tab.
        -->
        <button
          type="button"
          class="flex size-5 items-center justify-center rounded-full border border-muted text-dimmed transition-colors hover:border-primary-500/60 hover:bg-primary-500/10 hover:text-primary"
          aria-label="Projects"
          title="Projects — save, open, export (⌘O)"
          @click="emit('projects')"
        >
          <UIcon name="i-lucide-folder" class="size-3" />
        </button>
        <!--
          In the header rather than down the menu, for the same reason Projects
          is: a control nobody can find is a control nobody has. It also has to
          be visible to be honest — this is the one button whose whole job is to
          change how everything else looks, and burying it made the panel seem
          to have no opinion about light at all.

          It shows the destination, not the state. A moon on a dark panel is a
          badge saying where you already are; a sun says what clicking does.
        -->
        <button
          type="button"
          class="flex size-5 items-center justify-center rounded-full border border-muted text-dimmed transition-colors hover:border-primary-500/60 hover:bg-primary-500/10 hover:text-primary"
          :aria-label="isDark ? 'Switch the panel to light' : 'Switch the panel to dark'"
          :title="isDark ? 'Light panel — the shot is unaffected' : 'Dark panel — the shot is unaffected'"
          @click="toggleTheme"
        >
          <UIcon :name="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" class="size-3" />
        </button>
        <!--
          Sized to be found. At sixteen pixels this read as punctuation after the
          title rather than as the way into the only documentation the tool has.
        -->
        <button
          type="button"
          class="flex size-5 items-center justify-center rounded-full border border-muted font-mono text-[11px] leading-none text-dimmed transition-colors hover:border-primary-500/60 hover:bg-primary-500/10 hover:text-primary"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          @click="emit('shortcuts')"
        >
          ?
        </button>
        <LabMenu :actions="ACTIONS" label="Panel actions" />
      </div>
    </header>

    <!--
      The strip exists only when there is a choice to make.
      A permanent "Layer" tab that is disabled most of the time advertises a
      place you are usually not allowed to go, which reads as something broken
      rather than as something empty. With nothing selected there is exactly one
      thing this panel can show, so it shows it and says nothing. The moment a
      clip is selected a second destination exists — and it is named after the
      clip, so the panel states what is being edited instead of leaving it to be
      inferred from the fields.
    -->
    <div v-if="selectedLayer" class="flex shrink-0 border-b border-default">
      <button
        v-for="tab in TABS"
        :key="tab.value"
        type="button"
        class="relative min-w-0 flex-1 px-3 py-2 font-mono text-[10px] transition-colors"
        :class="activeTab === tab.value ? 'text-highlighted' : 'text-dimmed/70 hover:text-toned'"
        @click="activeTab = tab.value"
      >
        <span class="flex items-center justify-center gap-1.5">
          <UIcon v-if="tab.icon" :name="tab.icon" class="size-3 shrink-0 opacity-70" />
          <span class="truncate">{{ tab.label }}</span>
        </span>
        <span
          class="absolute inset-x-0 bottom-0 h-px transition-colors"
          :class="activeTab === tab.value ? 'bg-primary-500' : 'bg-transparent'"
        />
      </button>
    </div>

    <div v-if="selectedLayer" v-show="activeTab === 'layer'" class="min-h-0 flex-1 overflow-y-auto">
      <LabLayerProps
        :layer="selectedLayer"
        :timeline-length="settings.timelineLength"
        :sequence-ms
        @update="emit('updateLayer', selectedLayer.id, $event)"
        @remove="emit('removeLayer')"
        @duplicate="emit('duplicateLayer')"
      />
    </div>

    <div v-show="activeTab === 'shot' || !selectedLayer" class="min-h-0 flex-1 overflow-y-auto">
      <!--
        Named for what it is. "Stage" was a word from the renderer's vocabulary —
        it meant nothing to anyone opening the panel, and the two pixel fields
        under it asked for a number without saying what the number decided.
      -->
      <LabSection title="Viewport">
        <p class="mb-2 font-mono text-[10px] leading-relaxed text-dimmed">
          The window your component is laid out in before it is filmed. Narrow it
          to shoot the layout a phone gets.
        </p>

        <LabChoice
          label="Screen"
          :options="VIEWPORT_OPTIONS"
          :model-value="activeViewport"
          cards
          @update:model-value="setViewport(String($event))"
        />

        <div class="grid grid-cols-1 gap-1 @min-[300px]:grid-cols-2">
          <button
            type="button"
            class="border border-muted py-[5px] font-mono text-[10px] text-muted hover:border-accented hover:text-default transition-colors"
            title="Trim the viewport height to what the component actually occupies, so the camera has no dead frame to compose around."
            @click="emit('fitStage')"
          >
            trim to content
          </button>
          <button
            type="button"
            class="border border-muted py-[5px] font-mono text-[10px] text-muted hover:border-accented hover:text-default transition-colors"
            title="Restart the staged animation from its first frame."
            @click="emit('replay')"
          >
            replay
          </button>
        </div>

        <div class="mt-2">
          <LabToggle v-model="showSource" label="Show the plain layout" />
        </div>
      </LabSection>

      <LabSection title="Look">
        <LabLooks v-model:settings="settings" />
      </LabSection>

      <LabSection title="Camera">
        <!--
          Framing lives with the framing controls. This sat in the stage section
          next to "replay", where it read as one of three unrelated verbs.
        -->
        <button
          type="button"
          class="mb-2 w-full border border-muted py-[5px] font-mono text-[10px] text-muted transition-colors hover:border-accented hover:text-default"
          title="Back to a square-on, edge-to-edge framing. The grade is left alone."
          @click="emit('fit')"
        >
          reset the framing
        </button>

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
        <div class="mt-3 mb-1 font-pixel text-[10px] uppercase tracking-[0.18em] text-dimmed">
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
              ? 'border-primary-500/60 text-primary'
              : 'border-muted text-dimmed hover:border-accented hover:text-toned'"
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

        <p v-if="!hasDepth" class="mt-2 font-mono text-[10px] leading-relaxed text-warning">
          The plate faces the camera square-on, so every point of it is the same
          distance away and there is nothing to focus through. Add pitch or yaw.
        </p>
      </LabSection>

      <LabSection title="Bloom">
        <LabNumber v-model="settings.emission" label="Source brightness" v-bind="range('emission')" />
        <LabNumber v-model="settings.bloomIntensity" label="Intensity" v-bind="range('bloomIntensity')" />
        <LabNumber v-model="settings.bloomThreshold" label="Threshold" v-bind="range('bloomThreshold')" />
        <LabNumber v-model="settings.bloomKnee" label="Knee" v-bind="range('bloomKnee')" />
        <LabNumber v-model="settings.bloomRadius" label="Radius" v-bind="range('bloomRadius')" />
      </LabSection>

      <LabSection title="Grade">
        <LabNumber v-model="settings.exposure" label="Exposure" v-bind="range('exposure')" />
        <LabNumber v-model="settings.contrast" label="Contrast" v-bind="range('contrast')" />
        <LabNumber v-model="settings.saturation" label="Saturation" v-bind="range('saturation')" />
        <LabNumber v-model="settings.attenuation" label="Distance falloff" v-bind="range('attenuation')" />
        <LabNumber v-model="settings.aberration" label="Chromatic aberration" v-bind="range('aberration')" />
        <LabNumber v-model="settings.vignette" label="Vignette" v-bind="range('vignette')" />
        <LabNumber v-model="settings.grain" label="Grain" v-bind="range('grain')" />
        <LabToggle v-model="settings.tonemap" label="Filmic tonemap" />

        <div class="mt-2 flex items-center justify-between gap-3">
          <span class="font-mono text-[11px] text-dimmed">Background</span>
          <input
            v-model="settings.background"
            type="color"
            class="h-[22px] w-[104px] cursor-pointer border border-muted bg-transparent"
          >
        </div>
      </LabSection>

      <LabSection title="Output">
        <LabChoice
          label="Size"
          :options="OUTPUT_OPTIONS"
          :model-value="activeOutput"
          cards
          @update:model-value="setOutput(String($event))"
        />

        <LabChoice
          label="Frame rate"
          :options="RATE_OPTIONS"
          :model-value="settings.fps"
          @update:model-value="settings.fps = Number($event)"
        />

        <LabChoice
          label="Speed"
          :hint="HINTS.speed"
          :options="SPEED_OPTIONS"
          :model-value="settings.speed"
          @update:model-value="settings.speed = Number($event)"
        />

        <LabChoice
          label="File"
          :options="CONTAINERS"
          :model-value="settings.container"
          cards
          @update:model-value="settings.container = String($event)"
        />

        <LabNumber v-model="settings.tail" label="Tail" v-bind="range('tail')" />

        <!--
          The size is here rather than on a control: with the presets doing the
          setting, this is the only place the pixels are stated, and a shot out of
          an old link that matches no preset would otherwise never say its own
          frame size out loud.
        -->
        <p class="mt-2 font-mono text-[10px] leading-relaxed text-dimmed/70">
          {{ settings.outputWidth }}×{{ settings.outputHeight }} · {{ frameCount }} frames ·
          {{ segmentSeconds }}s of animation → {{ outputSeconds }}s of video
        </p>
      </LabSection>
    </div>

    <footer class="border-t border-default p-3 @min-[280px]:p-4">
      <div v-if="busy" class="mb-2">
        <!--
          scaleX rather than an animated width. A width transition is a layout
          animation driven by the main thread — which spends the whole export
          blocked in long synchronous captures, so the bar lurches and appears to
          slip backwards. A transform is composited and set outright, so it only
          ever moves forward, at exactly the rate progress does.
        -->
        <div class="h-[3px] w-full overflow-hidden bg-elevated">
          <div
            class="h-full origin-left bg-primary-500"
            :style="{ transform: `scaleX(${progress})` }"
          />
        </div>
        <div class="mt-2 flex items-center justify-between">
          <span class="font-mono text-[10px] text-dimmed">{{ Math.round(progress * 100) }}%</span>
          <button
            type="button"
            class="font-mono text-[10px] text-dimmed hover:text-error transition-colors"
            @click="emit('cancel')"
          >
            cancel
          </button>
        </div>
      </div>

      <div v-else class="flex gap-1">
        <button
          type="button"
          class="flex-1 border border-primary-500/50 bg-primary-500/10 py-[7px] font-mono text-[10px] text-primary hover:bg-primary-500/20 transition-colors"
          @click="emit('exportVideo')"
        >
          export {{ settings.container }}
        </button>
        <button
          type="button"
          class="border border-muted px-3 py-[7px] font-mono text-[10px] text-muted hover:border-accented hover:text-default transition-colors"
          @click="emit('exportPng')"
        >
          png
        </button>
      </div>

      <p class="mt-3 font-mono text-[9px] leading-relaxed text-dimmed/55">
        stage {{ captureMs.toFixed(0) }}ms<span v-if="!highPrecision"> · 8-bit targets, bloom will be flatter</span>
      </p>
    </footer>
  </aside>
</template>
