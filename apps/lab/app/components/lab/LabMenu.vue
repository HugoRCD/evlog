<script lang="ts">
/**
 * The actions that do not deserve permanent space.
 *
 * Reset, clear and copy link used to sit in the header as three words. They fit
 * at the width the panel opens at and nowhere near the width it can be dragged
 * to — the row wrapped, the title broke in half, and the help button ended up
 * under a label. Words that only fit sometimes are a layout that only works
 * sometimes, so they moved behind one button that is the same size at every
 * width, and gained room for a line of explanation on the way.
 */
export interface LabMenuAction {
  label: string
  icon?: string
  /** One line saying what it does, shown under the label. */
  hint?: string
  danger?: boolean
  /** Ask once before firing; the label becomes this until it is clicked again. */
  confirm?: string
  /**
   * Stay open after firing, for an action whose only feedback is its own label
   * changing — closing on the click would take the confirmation with it.
   */
  keepOpen?: boolean
  select: () => void
}
</script>

<script setup lang="ts">
const props = defineProps<{
  actions: LabMenuAction[]
  /** Accessible name for the trigger. */
  label: string
}>()

const open = ref(false)
const root = useTemplateRef('root')
const trigger = useTemplateRef('trigger')

/** Which action is waiting on a second click, cleared whenever the menu closes. */
const confirming = ref<string | null>(null)

function close(refocus = false) {
  open.value = false
  confirming.value = null
  if (refocus) trigger.value?.focus()
}

function onSelect(action: LabMenuAction) {
  if (action.confirm && confirming.value !== action.label) {
    confirming.value = action.label
    return
  }
  confirming.value = null
  if (!action.keepOpen) open.value = false
  action.select()
}

/**
 * Two ways out, because they catch different gestures: focusout covers tabbing
 * away and clicking another control, a pointer listener covers clicking the
 * canvas — which focuses nothing and so never fires a blur.
 */
function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (next && root.value?.contains(next)) return
  close()
}

function onPointerDown(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) close()
}

watch(open, (isOpen) => {
  if (isOpen) window.addEventListener('pointerdown', onPointerDown)
  else window.removeEventListener('pointerdown', onPointerDown)
})

onBeforeUnmount(() => window.removeEventListener('pointerdown', onPointerDown))
</script>

<template>
  <div
    ref="root"
    class="relative"
    @focusout="onFocusOut"
    @keydown.esc.stop="close(true)"
  >
    <button
      ref="trigger"
      type="button"
      class="flex size-5 items-center justify-center rounded-full border transition-colors"
      :class="open
        ? 'border-zinc-600 bg-zinc-900 text-zinc-200'
        : 'border-transparent text-zinc-600 hover:border-zinc-800 hover:bg-zinc-900/60 hover:text-zinc-300'"
      :aria-label="props.label"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="open ? close() : (open = true)"
    >
      <UIcon name="i-lucide-ellipsis" class="size-3.5" />
    </button>

    <div
      v-if="open"
      role="menu"
      class="absolute right-0 top-full z-30 mt-1.5 w-56 border border-zinc-800 bg-black p-1 shadow-[0_12px_32px_rgba(0,0,0,0.8)]"
    >
      <button
        v-for="action in actions"
        :key="action.label"
        type="button"
        role="menuitem"
        class="group flex w-full items-start gap-2 px-2 py-1.5 text-left transition-colors"
        :class="action.danger
          ? 'text-zinc-400 hover:bg-red-950/40 hover:text-red-300'
          : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'"
        @click="onSelect(action)"
      >
        <UIcon
          v-if="action.icon"
          :name="confirming === action.label ? 'i-lucide-triangle-alert' : action.icon"
          class="mt-px size-3.5 shrink-0 opacity-70"
        />
        <span class="min-w-0 flex-1">
          <span class="block font-mono text-[11px] leading-tight">
            {{ confirming === action.label ? action.confirm : action.label }}
          </span>
          <span
            v-if="action.hint"
            class="mt-0.5 block font-mono text-[9px] leading-snug text-zinc-600 transition-colors group-hover:text-zinc-500"
          >
            {{ action.hint }}
          </span>
        </span>
      </button>
    </div>
  </div>
</template>
