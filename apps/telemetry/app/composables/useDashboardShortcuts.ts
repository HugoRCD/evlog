/**
 * The dashboard's keyboard layer.
 *
 * Every shortcut is declared with the label the help sheet shows, so binding a
 * key and documenting it are the same edit — a help sheet maintained separately
 * from the handlers drifts on the first rebind, and a shortcut list that lies is
 * worse than none.
 *
 * `defineShortcuts` already suppresses everything while focus is in an input,
 * so typing "map" into the palette never jumps a tab.
 */

/** One binding: what it does, the keys the sheet renders, and the handler. */
export interface ShortcutSpec {
  label: string
  /** Passed to `UKbd` — `meta` renders as ⌘, plain letters as themselves. */
  keys: string[]
  handler?: () => void
  /**
   * The `defineShortcuts` key, when it differs from a single lowercase `keys[0]`.
   *
   * `null` documents a key that something else already owns. Every
   * `defineShortcuts` call adds its own listener, so binding ⌘K here as well as
   * in the palette would fire both handlers and toggle it straight back shut.
   */
  binding?: string | null
}

export interface ShortcutGroup {
  label: string
  shortcuts: ShortcutSpec[]
}

export interface DashboardShortcutActions {
  goToTab: (tab: string) => void
  setRange: (range: string) => void
  resetFilters: () => void
  toggleHelp: () => void
}

/**
 * Bind the dashboard shortcuts and return the groups the help sheet renders.
 *
 * Tabs are digits rather than mnemonics because their order is visible in the
 * UI; ranges are `d`/`w`/`m` because "day, week, month" is what the options
 * actually are, and nobody remembers which of three durations is number two.
 */
export function useDashboardShortcuts(actions: DashboardShortcutActions): { groups: ShortcutGroup[] } {
  const groups: ShortcutGroup[] = [
    {
      label: 'Navigate',
      shortcuts: [
        { label: 'Overview', keys: ['1'], handler: () => actions.goToTab('overview') },
        { label: 'Performance', keys: ['2'], handler: () => actions.goToTab('performance') },
        { label: 'Adoption', keys: ['3'], handler: () => actions.goToTab('adoption') },
        { label: 'Explorer', keys: ['4'], handler: () => actions.goToTab('explorer') },
      ],
    },
    {
      label: 'Filter',
      shortcuts: [
        { label: 'Last 24 hours', keys: ['d'], handler: () => actions.setRange('24h') },
        { label: 'Last 7 days', keys: ['w'], handler: () => actions.setRange('7d') },
        { label: 'Last 30 days', keys: ['m'], handler: () => actions.setRange('30d') },
        { label: 'Reset filters', keys: ['r'], handler: actions.resetFilters },
      ],
    },
    {
      label: 'General',
      shortcuts: [
        // Owned by CommandPalette's own `defineShortcuts`.
        { label: 'Search and commands', keys: ['meta', 'K'], binding: null },
        { label: 'Keyboard shortcuts', keys: ['?'], binding: '?', handler: actions.toggleHelp },
        // Nuxt UI's overlays close themselves on Escape.
        { label: 'Close panel', keys: ['esc'], binding: null },
      ],
    },
  ]

  const bindings = Object.fromEntries(
    groups
      .flatMap(group => group.shortcuts)
      .filter(shortcut => shortcut.binding !== null && shortcut.handler)
      .map(shortcut => [
        shortcut.binding ?? shortcut.keys[0]!.toLowerCase(),
        shortcut.handler!,
      ]),
  )

  defineShortcuts(bindings)

  return { groups }
}
