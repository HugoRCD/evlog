<script setup lang="ts">
/**
 * The shots this browser is keeping.
 *
 * The lab has always had exactly one document, which meant every new idea cost
 * you the last one. A project is that document under a name: saving takes a
 * snapshot, opening puts it back. Nothing leaves the machine — the row of
 * buttons that would be "sync" on a hosted tool is an Export here, because a
 * file somebody keeps is the only backup that does not depend on this site
 * still being up.
 *
 * Built on the shortcut sheet's pattern: teleported, over a plain scrim, with
 * the render loop paused behind it. A blurred scrim would re-filter the WebGL
 * canvas for as long as the list is open.
 */

import type { ProjectSummary } from '~/utils/lab/projects'

const open = defineModel<boolean>({ required: true })

// Teleported to `body`, which is outside `.lab-chrome` where the theme's tokens
// live — so the overlay has to carry the scope with it or it draws itself in the
// document's colours, which are the stage's and are always dark. See
// `useLabTheme`.
const { isDark } = useLabTheme()

const props = defineProps<{
  projects: ProjectSummary[]
  /** The one the working copy was last opened from or saved to. */
  activeId: string | null
  /** Name offered when saving, usually the active project or the first layer. */
  suggestedName: string
  busy: boolean
  /** Bytes used and available for this site, when the browser will say. */
  storage: { usage: number, quota: number } | null
  /** True once the browser has agreed not to evict this site's data. */
  persisted: boolean
}>()

const emit = defineEmits<{
  save: [name: string, id: string | null]
  openProject: [id: string]
  rename: [id: string, name: string]
  duplicate: [id: string]
  remove: [id: string]
  exportProject: [id: string]
  importFile: [file: File]
}>()

const fileInput = useTemplateRef('fileInput')
const saveField = useTemplateRef<HTMLInputElement>('saveField')
const saving = ref(false)
const draftName = ref('')
/** The project whose name is being edited, if any. */
const renaming = ref<string | null>(null)
const renameDraft = ref('')
/** Asked once before a delete, since there is no undo across projects. */
const confirming = ref<string | null>(null)

function startSave() {
  draftName.value = props.suggestedName
  saving.value = true
  void nextTick(() => saveField.value?.select())
}

/**
 * Thumbnails, as object URLs minted per list and revoked with it.
 *
 * A poster is a `Blob` in the database, and an `<img>` needs a URL. Rebuilt
 * whenever the list changes and the old set released on the way, so opening the
 * sheet twenty times does not leak twenty sets of handles into the page.
 */
const posters = ref(new Map<string, string>())

function releasePosters() {
  for (const url of posters.value.values()) URL.revokeObjectURL(url)
  posters.value = new Map()
}

watch(() => props.projects, (list) => {
  releasePosters()
  const next = new Map<string, string>()
  for (const project of list) {
    if (project.poster) next.set(project.id, URL.createObjectURL(project.poster))
  }
  posters.value = next
}, { immediate: true })

onBeforeUnmount(releasePosters)

function commitSave(overwrite: string | null) {
  const name = draftName.value.trim()
  if (!name) return
  emit('save', name, overwrite)
  saving.value = false
}

function startRename(project: ProjectSummary) {
  renaming.value = project.id
  renameDraft.value = project.name
}

function commitRename(id: string) {
  const name = renameDraft.value.trim()
  if (name) emit('rename', id, name)
  renaming.value = null
}

function onPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) emit('importFile', file)
}

/** Bytes, at the resolution a person reads them. */
function weight(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

/**
 * Relative for the last week, absolute after.
 *
 * "3 days ago" is how you find the thing you were working on; a date is how you
 * find the one from last month.
 */
function when(savedAt: number): string {
  const seconds = Math.max(0, (Date.now() - savedAt) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(savedAt).toLocaleDateString()
}

watch(open, (isOpen) => {
  if (isOpen) return
  saving.value = false
  renaming.value = null
  confirming.value = null
})

/** What this site is using, against what it is allowed. */
const usage = computed(() => {
  if (!props.storage) return null
  const { usage: used, quota } = props.storage
  return {
    used: weight(used),
    quota: quota > 1024 ** 3 ? `${(quota / 1024 ** 3).toFixed(1)} GB` : weight(quota),
    percent: quota ? Math.min(100, (used / quota) * 100) : 0,
  }
})
</script>

<template>
  <!--
    The scrim's black is a literal, not a token: a scrim's job is to darken what
    is behind it, and that is the same job in either theme. `bg-inverted` follows
    the ink and would come out white in dark — a flash instead of a scrim.
  -->
  <Teleport to="body">
    <div
      v-if="open"
      class="lab-chrome fixed inset-0 z-50 flex items-center justify-center bg-[var(--lab-scrim)] p-6"
      :data-theme="isDark ? 'dark' : 'light'"
      @pointerdown.self="open = false"
      @keydown.esc="open = false"
    >
      <div class="flex max-h-[80vh] w-full max-w-2xl flex-col border border-muted bg-default shadow-[var(--lab-shadow-sheet)]">
        <header class="flex items-center justify-between border-b border-muted px-4 py-3">
          <h2 class="font-pixel text-[13px] uppercase tracking-[0.2em] text-default">
            Projects
          </h2>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="border border-muted px-2 py-1 font-mono text-[10px] text-muted transition-colors hover:border-accented hover:text-highlighted disabled:opacity-40"
              :disabled="busy"
              @click="fileInput?.click()"
            >
              import a file
            </button>
            <button
              type="button"
              class="border border-accented/60 bg-elevated px-2 py-1 font-mono text-[10px] text-highlighted transition-colors hover:border-accented disabled:opacity-40"
              :disabled="busy"
              @click="startSave()"
            >
              save this shot
            </button>
          </div>
        </header>

        <!-- The save row, opened rather than always shown: a name field above a
             list reads as a filter until you try to type in it. -->
        <div v-if="saving" class="flex items-center gap-2 border-b border-muted bg-muted px-4 py-2.5">
          <input
            ref="saveField"
            v-model="draftName"
            type="text"
            maxlength="60"
            placeholder="Name this shot"
            class="min-w-0 flex-1 border border-muted bg-default px-2 py-1 font-mono text-[11px] text-highlighted outline-none focus:border-accented"
            @keydown.enter.prevent="commitSave(null)"
            @keydown.esc.stop="saving = false"
          >
          <button
            v-if="activeId"
            type="button"
            class="whitespace-nowrap border border-muted px-2 py-1 font-mono text-[10px] text-muted transition-colors hover:border-accented hover:text-highlighted"
            @click="commitSave(activeId)"
          >
            overwrite
          </button>
          <button
            type="button"
            class="whitespace-nowrap border border-accented/60 bg-elevated px-2 py-1 font-mono text-[10px] text-highlighted transition-colors hover:border-accented"
            @click="commitSave(null)"
          >
            save as new
          </button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <div v-if="!projects.length" class="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <UIcon name="i-lucide-folder-open" class="size-6 text-dimmed/35" />
            <p class="font-mono text-[11px] leading-relaxed text-dimmed/70">
              Nothing saved yet.<br>
              A project keeps this shot — the layers, the grade, the framing — so you can come back to it.
            </p>
            <button
              type="button"
              class="mt-1 border border-accented/60 bg-elevated px-3 py-1.5 font-mono text-[10px] text-highlighted transition-colors hover:border-accented disabled:opacity-40"
              :disabled="busy"
              @click="startSave()"
            >
              save this shot
            </button>
          </div>

          <div
            v-for="project in projects"
            :key="project.id"
            class="group flex items-center gap-3 border-b border-default px-4 py-2.5 transition-colors hover:bg-muted"
            :class="project.id === activeId ? 'bg-muted/60' : ''"
          >
            <!--
              The frame it was saved on. A list of shots without pictures is a
              list of filenames, and a filename is the one thing that cannot say
              what a shot looks like.
            -->
            <button
              type="button"
              class="relative aspect-video w-24 shrink-0 overflow-hidden border border-muted bg-muted transition-colors hover:border-accented disabled:opacity-40"
              :title="`Open ${project.name}`"
              :disabled="busy"
              @click="emit('openProject', project.id)"
            >
              <img
                v-if="posters.get(project.id)"
                :src="posters.get(project.id)"
                alt=""
                class="size-full object-cover"
              >
              <UIcon
                v-else
                name="i-lucide-image-off"
                class="absolute left-1/2 top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 text-dimmed/35"
              />
            </button>

            <div class="min-w-0 flex-1">
              <input
                v-if="renaming === project.id"
                v-model="renameDraft"
                type="text"
                maxlength="60"
                class="w-full border border-accented bg-default px-1.5 py-0.5 font-mono text-[11px] text-highlighted outline-none"
                @keydown.enter.prevent="commitRename(project.id)"
                @keydown.esc.stop="renaming = null"
                @blur="commitRename(project.id)"
              >
              <button
                v-else
                type="button"
                class="block max-w-full truncate text-left font-mono text-[11px] text-default transition-colors hover:text-highlighted"
                :disabled="busy"
                @click="emit('openProject', project.id)"
              >
                {{ project.name }}
                <span v-if="project.id === activeId" class="ml-1.5 text-[9px] text-dimmed/70">open</span>
              </button>
              <p class="mt-0.5 font-mono text-[9px] text-dimmed/70">
                {{ when(project.savedAt) }} · {{ project.layers }} layer{{ project.layers === 1 ? '' : 's' }} · {{ project.bytes ? weight(project.bytes) : 'no media' }}
              </p>
            </div>

            <!--
              Drawn, not revealed on hover. The rest of this tool holds that an
              invisible target is a target you cannot aim at, and a row of
              actions that appears under the pointer is the same mistake with a
              transition on it.
            -->
            <div class="flex shrink-0 items-center gap-0.5">
              <button
                v-for="action in [
                  { key: 'open', icon: 'i-lucide-folder-open', title: 'Open' },
                  { key: 'export', icon: 'i-lucide-download', title: 'Export as a file' },
                  { key: 'rename', icon: 'i-lucide-pencil', title: 'Rename' },
                  { key: 'duplicate', icon: 'i-lucide-copy', title: 'Duplicate' },
                ]"
                :key="action.key"
                type="button"
                class="flex size-6 items-center justify-center text-dimmed/55 transition-colors hover:bg-elevated hover:text-highlighted disabled:opacity-40"
                :title="action.title"
                :disabled="busy"
                @click="action.key === 'open' ? emit('openProject', project.id)
                  : action.key === 'export' ? emit('exportProject', project.id)
                    : action.key === 'rename' ? startRename(project)
                      : emit('duplicate', project.id)"
              >
                <UIcon :name="action.icon" class="size-3.5" />
              </button>
              <!-- Two clicks, because a project is the only thing in the lab
                   that undo cannot bring back. -->
              <button
                type="button"
                class="flex h-6 items-center justify-center px-1 font-mono text-[9px] transition-colors"
                :class="confirming === project.id ? 'text-error' : 'text-dimmed/55 hover:bg-error/10 hover:text-error'"
                :title="confirming === project.id ? 'Click again to delete' : 'Delete'"
                :disabled="busy"
                @click="confirming === project.id ? (emit('remove', project.id), confirming = null) : (confirming = project.id)"
              >
                <UIcon v-if="confirming !== project.id" name="i-lucide-trash-2" class="size-3.5" />
                <span v-else>sure?</span>
              </button>
            </div>
          </div>
        </div>

        <footer class="border-t border-muted px-4 py-2.5">
          <!--
            The number, because "stored in your browser" reads as a limit and
            people assume it is the five megabytes local storage gives them. It
            is a share of the disk, and saying so is the difference between
            importing footage and not daring to.
          -->
          <div v-if="usage" class="mb-2 flex items-center gap-2">
            <div class="h-0.5 flex-1 bg-elevated">
              <div class="h-full bg-accented" :style="{ width: `${Math.max(usage.percent, 0.5)}%` }" />
            </div>
            <span class="shrink-0 font-mono text-[9px] text-dimmed/70">
              {{ usage.used }} of {{ usage.quota }}
            </span>
          </div>

          <div class="flex items-end justify-between gap-4">
            <p class="font-mono text-[9px] leading-relaxed text-dimmed/70">
              Kept on this machine, in this browser.
              <span v-if="!persisted" class="text-dimmed/55">Clearing site data removes it — export anything you want to keep.</span>
              <span v-else>Marked as persistent, so the browser will not evict it.</span>
            </p>
            <button
              type="button"
              class="shrink-0 font-mono text-[10px] text-dimmed transition-colors hover:text-default"
              @click="open = false"
            >
              close · esc
            </button>
          </div>
        </footer>
      </div>

      <input
        ref="fileInput"
        type="file"
        accept=".rlab,application/zip"
        class="hidden"
        @change="onPicked"
      >
    </div>
  </Teleport>
</template>
