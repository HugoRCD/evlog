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
  /**
   * Greyed and inert, for an action with nothing to act on yet.
   *
   * Left in the list rather than filtered out: a menu whose items move as its
   * state changes has to be re-read every time it opens, and an action you
   * cannot take right now is still worth knowing exists.
   */
  disabled?: boolean
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
  if (action.disabled) return
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
        ? 'border-accented bg-elevated text-default'
        : 'border-transparent text-dimmed/70 hover:border-muted hover:bg-elevated/60 hover:text-toned'"
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
      class="absolute right-0 top-full z-30 mt-1.5 w-56 border border-muted bg-default p-1 shadow-[var(--lab-shadow-overlay)]"
    >
      <button
        v-for="action in actions"
        :key="action.label"
        type="button"
        role="menuitem"
        class="group flex w-full items-start gap-2 px-2 py-1.5 text-left transition-colors"
        :disabled="action.disabled"
        :class="action.disabled
          ? 'cursor-default text-dimmed/55'
          : action.danger
            ? 'text-muted hover:bg-error/10 hover:text-error'
            : 'text-muted hover:bg-elevated hover:text-highlighted'"
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
            class="mt-0.5 block font-mono text-[9px] leading-snug transition-colors"
            :class="action.disabled ? 'text-dimmed/35' : 'text-dimmed/70 group-hover:text-dimmed'"
          >
            {{ action.hint }}
          </span>
        </span>
      </button>
    </div>
  </div>
</template>
