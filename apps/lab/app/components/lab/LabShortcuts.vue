<script setup lang="ts">

/**
 * Everything the keyboard does, in one place.
 *
 * A tool this dense cannot teach itself through tooltips alone — you have to be
 * able to ask "what can I do here" and get an answer. Editors have trained
 * everyone to press `?` for exactly that, so the cost of discovering the whole
 * surface is one keystroke rather than a spelunk through the source.
 */

const open = defineModel<boolean>({ required: true })

// Teleported to `body`, which is outside `.lab-chrome` where the theme's tokens
// live — so the overlay has to carry the scope with it or it draws itself in the
// document's colours, which are the stage's and are always dark. See
// `useLabTheme`.
const { isDark } = useLabTheme()

interface Shortcut {
  keys: string[]
  label: string
}

const GROUPS: { title: string, items: Shortcut[] }[] = [
  {
    title: 'Transport',
    items: [
      { keys: ['Space'], label: 'Play or pause' },
      { keys: ['←', '→'], label: 'Step one frame' },
      { keys: ['⇧', '←', '→'], label: 'Step ten frames' },
      { keys: ['Home'], label: 'Jump to the start' },
      { keys: ['End'], label: 'Jump to the end' },
      { keys: ['R'], label: 'Replay from the top' },
    ],
  },
  {
    title: 'Timeline',
    items: [
      { keys: ['Scroll'], label: 'Zoom in and out of time' },
      { keys: ['⇧', 'Scroll'], label: 'Pan along the timeline' },
      { keys: ['Z'], label: 'Fit the whole take in view' },
      { keys: ['C'], label: 'Split the selected clip at the playhead' },
      { keys: ['J'], label: 'Join a cut back together' },
      { keys: ['Drag'], label: 'Reorder the tracks by their names' },
      { keys: ['Right click'], label: 'Clip actions' },
      { keys: ['Drop'], label: 'Drop images or footage onto the time they should start at' },
    ],
  },
  {
    // Named for what it holds rather than for layers alone: undo reaches the
    // grade, the framing and the output settings too.
    title: 'Editing',
    items: [
      { keys: ['⌘', 'Z'], label: 'Undo' },
      { keys: ['⌘', '⇧', 'Z'], label: 'Redo' },
      { keys: ['⌘', 'O'], label: 'Projects — save, open, export' },
      { keys: ['⌘', 'S'], label: 'Save into the open project' },
      { keys: ['⌘', 'C'], label: 'Copy the selected layer' },
      { keys: ['⌘', 'V'], label: 'Paste at the playhead' },
      { keys: ['⌘', 'D'], label: 'Duplicate' },
      { keys: ['⌫'], label: 'Delete' },
      { keys: ['Esc'], label: 'Deselect' },
    ],
  },
  {
    title: 'Camera',
    items: [
      { keys: ['Drag'], label: 'Orbit the shot' },
      { keys: ['⇧', 'Drag'], label: 'Pan the shot' },
      { keys: ['⌥', 'Drag'], label: 'Roll the shot' },
      { keys: ['Scroll'], label: 'Zoom the shot' },
    ],
  },
  {
    title: 'Controls',
    items: [
      { keys: ['Drag'], label: 'Set a value' },
      { keys: ['⇧', 'Drag'], label: 'Fine adjustment' },
      { keys: ['Double click'], label: 'Type an exact value' },
      { keys: ['Right click'], label: 'Restore the default' },
    ],
  },
  {
    title: 'View',
    items: [
      { keys: ['H'], label: 'Hide the panels for a clean frame' },
      { keys: ['G'], label: 'Guides, safe area and rulers' },
      { keys: ['?'], label: 'This list' },
    ],
  },
]
</script>

<template>
  <!--
    Rendered on the body, not inside the app.
    The lab's root is a fixed, z-indexed flex container, which makes it a
    stacking context: anything inside it competes with the panels no matter how
    high its own z-index goes. That produced an overlay that captured every
    click while being painted underneath — the app looked frozen. Teleporting
    past it removes the contest instead of trying to win it.
  -->
  <!--
    A plain scrim, not a blurred one. `backdrop-blur` over a live WebGL canvas
    re-filters the whole frame on every composite, which on a real GPU turns
    opening this sheet into a stall. The preview pauses behind it anyway, so
    there is no motion left for a blur to soften.

    Its black is a literal, not a token: a scrim's job is to darken what is
    behind it, and that is the same job in either theme. `bg-inverted` follows
    the ink and would come out white in dark — a flash instead of a scrim.

    Nothing may sit between `<Transition>` and its element — not even a comment.
    A second child leaves the transition unable to resolve which node it drives,
    and `enter-from` is then never taken off: the sheet stays at opacity zero
    while still capturing every click, which is precisely the invisible overlay
    the teleport was meant to have ended.
  -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="lab-chrome fixed inset-0 z-300 flex items-center justify-center bg-[var(--lab-scrim)] p-8"
        :data-theme="isDark ? 'dark' : 'light'"
        @click="open = false"
      >
        <Transition
          appear
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="scale-[0.98] opacity-0"
        >
          <div
            class="max-h-full w-full max-w-3xl overflow-y-auto border border-muted bg-muted p-6 shadow-[var(--lab-shadow-sheet)]"
            @click.stop
          >
            <div class="mb-5 flex items-baseline justify-between">
              <h2 class="font-pixel text-[12px] uppercase tracking-[0.2em] text-default">
                Keyboard
              </h2>
              <button
                type="button"
                class="font-mono text-[10px] text-dimmed/70 transition-colors hover:text-toned"
                @click="open = false"
              >
                close · esc
              </button>
            </div>

            <div class="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              <section v-for="group in GROUPS" :key="group.title">
                <h3 class="mb-2 font-pixel text-[10px] uppercase tracking-[0.18em] text-dimmed">
                  {{ group.title }}
                </h3>
                <ul class="space-y-1.5">
                  <li
                    v-for="item in group.items"
                    :key="item.label"
                    class="flex items-baseline justify-between gap-3"
                  >
                    <span class="font-mono text-[11px] leading-tight text-muted">{{ item.label }}</span>
                    <span class="flex shrink-0 gap-0.5">
                      <kbd
                        v-for="key in item.keys"
                        :key
                        class="border border-muted bg-elevated px-1.5 py-px font-mono text-[10px] text-toned"
                      >{{ key }}</kbd>
                    </span>
                  </li>
                </ul>
              </section>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
