<script setup lang="ts">
/**
 * The look picker.
 *
 * A look is picked, then dosed. That second step is the whole point: the old
 * presets were a jump to one fixed grade, which is why they suited the clip they
 * were authored on and overshot everything else. Here the chip chooses a
 * direction and the dial chooses how far, so the same look works on a dense
 * panel and on a small still.
 *
 * Saving and sharing live here rather than with the document's share link. A look
 * is how you like things to look, not part of any one shot — it has to outlive
 * the composition it was found on, and be sendable without it.
 */

import { RANGES, HINTS, DEFAULT_SETTINGS } from '~/utils/lab/settings'
import type { LabSettings } from '~/utils/lab/settings'
import {
  BUILT_IN_LOOKS,
  MAX_LOOK_NAME,
  applyLookEntry,
  deleteUserLook,
  findLook,
  isBuiltIn,
  isLookModified,
  loadUserLooks,
  lookShareUrl,
  normalizeLookName,
  parseLookInput,
  readLook,
  saveUserLook,
} from '~/utils/lab/looks'
import type { LookEntry } from '~/utils/lab/looks'

const settings = defineModel<LabSettings>('settings', { required: true })

const userLooks = ref<LookEntry[]>([])
// Local storage is not readable during prerender, and reading it in setup would
// make the first client render disagree with the shell.
onMounted(() => {
  userLooks.value = loadUserLooks()
})

/** Looks arriving from a link, kept for the session so the chip has something to be. */
const transient = ref<LookEntry[]>([])

const entries = computed(() => [...BUILT_IN_LOOKS, ...userLooks.value, ...transient.value])

const active = computed(() => findLook(settings.value.look, [...userLooks.value, ...transient.value]))
const modified = computed(() => isLookModified(settings.value, [...userLooks.value, ...transient.value]))

/** Transient feedback under the picker — a save, a copy, or what went wrong. */
const notice = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | undefined

function say(message: string) {
  notice.value = message
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    notice.value = '' 
  }, 2600)
}

onBeforeUnmount(() => clearTimeout(noticeTimer))

function pick(entry: LookEntry) {
  remember(entry)
  /*
   * Always at full strength.
   *
   * The dial used to carry over between looks, justified as a preference. It is
   * not one: push it to 1.4 while exploring one look and every look picked
   * afterwards arrives extrapolated 40% past what it was authored at — a 22°
   * lean becomes 32°, a sharp band collapses from 0.45 to 0.16, and the whole
   * set reads as broken. A look means what it says the moment you pick it; the
   * dial is for refining the one already chosen.
   */
  settings.value = applyLookEntry(settings.value, entry, 1)
}

/**
 * Keep a look resolvable by name for the rest of the session.
 *
 * Applying it does not need this — `applyLookEntry` takes the values. The dial
 * does: it re-blends from whatever `settings.look` names, and a look from a link
 * belongs to no list, so without this it would have a chip lit and a dead dial.
 */
function remember(entry: LookEntry) {
  if (findLook(entry.name, [...userLooks.value, ...transient.value])) return
  transient.value = [...transient.value, entry]
}

/** The dial re-blends from the named look, so dragging it never compounds. */
const amount = computed({
  get: () => settings.value.lookAmount,
  set: (next: number) => {
    settings.value = active.value
      ? applyLookEntry(settings.value, active.value, next)
      : { ...settings.value, lookAmount: next }
  },
})

/**
 * Re-solve the framing when the shape of the shot changes.
 *
 * This is the point of storing coverage instead of a zoom. Fit the stage to a
 * short animation, switch to 9:16, drop in a square image — the tilted plate now
 * projects to a different outline, and the zoom that framed it no longer does. So
 * the active look is re-resolved against the new aspects.
 *
 * Only the four size fields are watched, and re-applying touches none of them,
 * so this cannot feed itself. A look edited by hand is left alone: re-fitting it
 * would quietly overwrite the edits.
 */
watch(
  () => [settings.value.stageWidth, settings.value.stageHeight, settings.value.outputWidth, settings.value.outputHeight].join(),
  () => {
    if (!active.value || modified.value) return
    settings.value = applyLookEntry(settings.value, active.value, settings.value.lookAmount)
  },
)

const naming = ref(false)
const draftName = ref('')
const nameInput = useTemplateRef<HTMLInputElement>('nameInput')

async function startNaming() {
  naming.value = true
  // Whatever is in force is the thing being saved, so its name is the obvious
  // starting point — usually as `neon copy` rather than from nothing.
  draftName.value = active.value && !isBuiltIn(active.value.name) ? active.value.name : ''
  await nextTick()
  nameInput.value?.select()
}

function commitName() {
  // Normalized the same way the store does, or a name with a double space is
  // saved under one spelling and looked up under another.
  const name = normalizeLookName(draftName.value)
  const result = saveUserLook(name, readLook(settings.value))
  if (!result.ok) {
    say(result.reason)
    return
  }
  userLooks.value = result.entries
  naming.value = false
  // The values are now the look at full strength — they were saved verbatim, so
  // amount 1 reproduces them exactly. Pointing the settings at the new name
  // lights the chip and gives the dial an origin to work from.
  settings.value = { ...settings.value, look: name, lookAmount: 1 }
  say(`Saved as “${name}”.`)
}

function remove(entry: LookEntry) {
  userLooks.value = deleteUserLook(entry.name)
  // Also drop it from the session list, or a look that arrived by link keeps its
  // chip after being dismissed — storage never held it, so removing it there
  // cannot make it go away.
  transient.value = transient.value.filter(candidate => candidate.name !== entry.name)
  if (settings.value.look === entry.name) settings.value = { ...settings.value, look: '' }
  say(`Deleted “${entry.name}”.`)
}

async function copyLook() {
  const entry = active.value
  const name = entry?.name || 'look'
  try {
    await navigator.clipboard.writeText(lookShareUrl(name, readLook(settings.value)))
    say('Look link copied — it carries the grade only, not your shot.')
  } catch {
    say('The clipboard refused. Copy the URL from the address bar instead.')
  }
}

async function pasteLook() {
  let text = ''
  try {
    text = await navigator.clipboard.readText()
  } catch {
    say('The clipboard could not be read — allow it, or open the look link directly.')
    return
  }

  const entry = parseLookInput(text)
  if (!entry) {
    say('That is not a look link.')
    return
  }
  pick(entry)
  say(`Applied “${entry.name}”.`)
}

const amountRange = { ...RANGES.lookAmount, default: DEFAULT_SETTINGS.lookAmount, hint: HINTS.lookAmount }
</script>

<template>
  <div>
    <div class="grid grid-cols-2 gap-1">
      <button
        v-for="entry in entries"
        :key="entry.name"
        type="button"
        class="group relative border py-1.5 pr-1 pl-2 text-left font-mono text-[10px] transition-colors"
        :class="active?.name === entry.name
          ? 'border-primary-500/60 text-primary'
          : 'border-muted text-muted hover:border-primary-500/50 hover:text-primary'"
        :title="entry.note"
        @click="pick(entry)"
      >
        <span class="truncate">{{ entry.name }}</span>
        <!--
          Only user looks can be deleted, and the control stays out of the way
          until the chip is hovered — a row of delete buttons reads as a list of
          things to get rid of.
        -->
        <span
          v-if="!isBuiltIn(entry.name)"
          class="absolute inset-y-0 right-0 hidden items-center px-1.5 text-dimmed/70 hover:text-error group-hover:flex"
          title="Delete this look"
          @click.stop="remove(entry)"
        >
          <UIcon name="i-lucide-x" class="block size-2.5" />
        </span>
      </button>

      <!--
        Saving sits in the grid, as the last chip.
        It used to be a bare "save look" button under the picker, which gave no
        clue what it would take a copy of — it read as arriving out of nowhere.
        In the grid it is plainly one more entry in the same list, and the label
        says where the values come from.
      -->
      <button
        type="button"
        class="flex items-center justify-center gap-1 border border-dashed border-muted py-1.5 font-mono text-[10px] text-dimmed transition-colors hover:border-primary-500/50 hover:text-primary"
        title="Add the shot's current framing and grade to this list as a look of your own"
        @click="startNaming"
      >
        <UIcon name="i-lucide-plus" class="block size-2.5" />
        <span>from shot</span>
      </button>
    </div>

    <!--
      The note earns its space: the names alone do not say which looks need a
      focal plane placed and which work on anything.
    -->
    <p v-if="active" class="mt-1.5 font-mono text-[10px] leading-relaxed text-dimmed">
      {{ active.note }}
    </p>

    <div class="mt-1.5" :class="active ? '' : 'pointer-events-none opacity-40'">
      <LabNumber v-model="amount" label="Amount" v-bind="amountRange" />
    </div>

    <p v-if="modified" class="mt-1 font-mono text-[10px] text-warning">
      Edited by hand — dragging Amount will discard those edits.
    </p>

    <div v-if="naming" class="mt-1.5 flex items-center gap-1 border border-accented bg-elevated/60 px-2 py-1">
      <input
        ref="nameInput"
        v-model="draftName"
        type="text"
        :maxlength="MAX_LOOK_NAME"
        placeholder="name this look"
        class="min-w-0 flex-1 bg-transparent font-mono text-[11px] leading-none text-highlighted outline-none placeholder:text-dimmed/70"
        @keydown.enter.prevent="commitName"
        @keydown.esc.prevent="naming = false"
      >
      <button type="button" class="shrink-0 font-mono text-[10px] text-primary/85 hover:text-primary" @click="commitName">
        save
      </button>
    </div>

    <div v-else class="mt-1.5 flex gap-1">
      <button
        type="button"
        class="flex-1 border border-muted py-1.25 font-mono text-[10px] text-muted transition-colors hover:border-accented hover:text-default"
        title="Copy a link carrying this look alone — not your composition"
        @click="copyLook"
      >
        copy look
      </button>
      <button
        type="button"
        class="flex-1 border border-muted py-1.25 font-mono text-[10px] text-muted transition-colors hover:border-accented hover:text-default"
        title="Apply a look link from the clipboard"
        @click="pasteLook"
      >
        paste look
      </button>
    </div>

    <p v-if="notice" class="mt-1 font-mono text-[10px] leading-relaxed text-muted">
      {{ notice }}
    </p>
  </div>
</template>
