import { describe, expect, it, vi } from 'vitest'

/**
 * `defineShortcuts` is a Nuxt UI auto-import that installs a real keydown
 * listener; stubbing it lets the binding table be asserted without a DOM.
 */
const defineShortcuts = vi.fn()
vi.stubGlobal('defineShortcuts', defineShortcuts)

const { useDashboardShortcuts } = await import('../app/composables/useDashboardShortcuts')

function setup() {
  defineShortcuts.mockClear()
  const actions = {
    goToTab: vi.fn(),
    setRange: vi.fn(),
    resetFilters: vi.fn(),
    toggleHelp: vi.fn(),
  }
  const { groups } = useDashboardShortcuts(actions)
  const bindings = defineShortcuts.mock.calls[0]![0] as Record<string, () => void>
  return { actions, groups, bindings }
}

describe('useDashboardShortcuts', () => {
  it('binds the keys the help sheet advertises', () => {
    const { bindings } = setup()
    expect(Object.keys(bindings).sort()).toEqual(['1', '2', '3', '4', '?', 'd', 'm', 'r', 'w'])
  })

  it('does not rebind keys another component already owns', () => {
    /* Every `defineShortcuts` call adds its own listener, so binding meta+K
       here as well as in CommandPalette would run both handlers and toggle the
       palette straight back shut. Escape is the overlays' own. */
    const { bindings, groups } = setup()
    const general = groups.find(group => group.label === 'General')!

    expect(general.shortcuts.map(s => s.label)).toContain('Search and commands')
    expect(bindings).not.toHaveProperty('meta_k')
    expect(bindings).not.toHaveProperty('escape')
  })

  it('routes each key to its action', () => {
    const { actions, bindings } = setup()

    bindings['3']!()
    expect(actions.goToTab).toHaveBeenCalledWith('adoption')

    bindings.w!()
    expect(actions.setRange).toHaveBeenCalledWith('7d')

    bindings.r!()
    expect(actions.resetFilters).toHaveBeenCalled()

    bindings['?']!()
    expect(actions.toggleHelp).toHaveBeenCalled()
  })

  it('documents every binding it installs', () => {
    /* A key that fires with no row in the sheet is a key nobody discovers. */
    const { groups, bindings } = setup()
    const documented = groups.flatMap(group => group.shortcuts)

    for (const key of Object.keys(bindings)) {
      const match = documented.find(s => (s.binding ?? s.keys[0]!.toLowerCase()) === key)
      expect(match, `${key} has no row in the help sheet`).toBeDefined()
      expect(match!.keys.length).toBeGreaterThan(0)
    }
  })

  it('only ever names a tab or range the dashboard has', () => {
    /* The page guards these before assigning, so a typo here would fail
       silently as a dead key rather than as an error. */
    const { actions, groups } = setup()

    for (const shortcut of groups.flatMap(group => group.shortcuts)) {
      shortcut.handler?.()
    }

    expect(actions.goToTab.mock.calls.flat()).toEqual(['overview', 'performance', 'adoption', 'explorer'])
    expect(actions.setRange.mock.calls.flat()).toEqual(['24h', '7d', '30d'])
  })
})
