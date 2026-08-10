<script setup lang="ts">
/**
 * What the app opens on when nothing is open.
 *
 * The lab used to restore the last take and put you inside it. That reads as
 * helpful and is not: most sessions here are one picture, most saved documents
 * are videos, and landing in somebody's half-cut timeline means clearing a
 * stage before you can start. The cost was paid every single time, to save a
 * click on the rare session that really was a continuation.
 *
 * So the question is asked once, up front, and answered in one click. Recents
 * are on the same screen rather than behind it, because "carry on with that
 * one" is a third answer to the same question and hiding it would trade one
 * wrong default for another.
 */
import type { LabMode } from '~/utils/lab/storage'
import type { ProjectSummary } from '~/utils/lab/projects'

defineProps<{
  /** Most recently saved first; the launcher shows only the first few. */
  recent: ProjectSummary[]
}>()

const emit = defineEmits<{
  create: [mode: LabMode]
  open: [id: string]
  browse: []
}>()

/**
 * Shot first, and not alphabetically.
 *
 * The order is the claim: this is a tool for making one picture, and the take
 * is the longer errand you sometimes also need.
 */
const KINDS = [
  {
    mode: 'shot' as const,
    label: 'Shot',
    icon: 'i-lucide-image',
    note: 'One frame. Drop a photo in, or film a component at an instant you pick.',
  },
  {
    mode: 'video' as const,
    label: 'Video',
    icon: 'i-lucide-film',
    note: 'A take over time, on a timeline of clips.',
  },
]

/** Enough to recognise the one you meant, few enough to scan without reading. */
const RECENT_LIMIT = 4
</script>

<template>
  <div class="absolute inset-0 z-30 flex items-center justify-center bg-default p-8">
    <div class="w-full max-w-lg">
      <span class="block font-pixel text-[11px] uppercase tracking-[0.2em] text-dimmed">
        Render labs
      </span>
      <p class="mt-2 font-mono text-[11px] leading-relaxed text-muted">
        What are you making?
      </p>

      <div class="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          v-for="kind in KINDS"
          :key="kind.mode"
          type="button"
          class="group border border-muted p-4 text-left transition-colors hover:border-primary-500/60 hover:bg-primary-500/5"
          @click="emit('create', kind.mode)"
        >
          <span class="flex items-center gap-2">
            <UIcon :name="kind.icon" class="size-3.5 shrink-0 text-dimmed transition-colors group-hover:text-primary" />
            <span class="font-mono text-[12px] text-default">{{ kind.label }}</span>
          </span>
          <span class="mt-1.5 block font-mono text-[10px] leading-relaxed text-dimmed">
            {{ kind.note }}
          </span>
        </button>
      </div>

      <!--
        Only when there is something to carry on with. An empty "Recent" heading
        on a first run is a promise the tool cannot keep yet.
      -->
      <div v-if="recent.length" class="mt-6">
        <div class="mb-1.5 flex items-baseline justify-between gap-2">
          <span class="font-pixel text-[10px] uppercase tracking-[0.18em] text-dimmed">
            Recent
          </span>
          <button
            type="button"
            class="font-mono text-[10px] text-dimmed transition-colors hover:text-primary"
            @click="emit('browse')"
          >
            all projects
          </button>
        </div>

        <div class="flex flex-col">
          <button
            v-for="project in recent.slice(0, RECENT_LIMIT)"
            :key="project.id"
            type="button"
            class="flex items-center gap-2 border-b border-default py-2 text-left transition-colors hover:text-primary"
            @click="emit('open', project.id)"
          >
            <UIcon
              :name="project.mode === 'shot' ? 'i-lucide-image' : 'i-lucide-film'"
              class="size-3 shrink-0 text-dimmed"
            />
            <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-toned">{{ project.name }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
