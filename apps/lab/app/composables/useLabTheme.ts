/**
 * The theme the tool wears, which is not the theme of the document.
 *
 * This deliberately does not use `useColorMode`. Colour mode is a property of
 * the page: it puts `dark` or `light` on `<html>`, and everything under it
 * follows. That is exactly wrong here, because one of the things under it is the
 * stage — a live DOM node rasterized into the plate, which has to keep the
 * colours of the app it came from whatever the panel is wearing.
 *
 * It is not enough to put `dark` back on the stage to shield it, either. That
 * was tried and it silently changed every export: a class on the element wins
 * over a value inherited from `:root`, so the source stylesheet's own
 * `--ui-bg: zinc-950` lost to Nuxt UI's default `.dark` block and the plate came
 * out a step lighter than the site it was copied from. Nothing about the page
 * looked wrong; the rendered video was simply not the same video.
 *
 * So `<html>` stays dark, permanently, and the panel's theme is an attribute on
 * the chrome instead — see `.lab-chrome[data-theme]` in `assets/css/main.css`.
 * The stage sits outside that scope and is untouched by any of this.
 */

export type LabThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'render-labs:theme'

/**
 * Module state rather than `useState`, because this app is `ssr: false` and
 * there is exactly one lab per document. A composable that returned a fresh ref
 * per caller would let the header and the chrome disagree about the theme.
 */
const preference = ref<LabThemePreference>('system')
/** What the machine says, when the preference defers to it. */
const systemDark = ref(true)
let listening = false

function read(): LabThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    // A private window with storage blocked still gets a working theme.
    return 'system'
  }
}

export function useLabTheme() {
  if (import.meta.client && !listening) {
    listening = true
    preference.value = read()

    const query = window.matchMedia('(prefers-color-scheme: dark)')
    systemDark.value = query.matches
    // Kept live rather than read once: a machine on an automatic schedule
    // changes its mind at dusk, and a tool that only noticed on reload would
    // sit in yesterday's theme all evening.
    query.addEventListener('change', event => (systemDark.value = event.matches))
  }

  const isDark = computed(() => (preference.value === 'system' ? systemDark.value : preference.value === 'dark'))

  /**
   * Toggling writes an explicit choice, never `system`.
   *
   * Going back through `system` would mean the click sometimes did nothing —
   * choosing "light" while the machine is already light is a no-op the user
   * reads as a broken button.
   */
  function toggle() {
    preference.value = isDark.value ? 'light' : 'dark'
    try {
      localStorage.setItem(STORAGE_KEY, preference.value)
    } catch {
      // The theme still holds for this session; only the memory of it is lost.
    }
  }

  return { preference, isDark, toggle }
}
