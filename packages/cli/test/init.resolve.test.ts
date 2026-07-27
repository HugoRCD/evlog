import { describe, expect, it } from 'vitest'
import { createContext } from '../src/core/context'
import { availableExtras, DESTINATIONS, EXTRAS, findDestination } from '../src/lib/init/catalog'
import { canPrompt } from '../src/lib/init/prompts'
import { droppedExtras, parseDrainArg, parseExtrasArg, resolveAnswers } from '../src/lib/init/resolve'

describe('parseDrainArg', () => {
  it('accepts every id the catalog advertises', () => {
    for (const destination of DESTINATIONS) {
      expect(parseDrainArg(destination.id)).toBe(destination.id)
    }
  })

  it('refuses an unknown destination instead of falling back', () => {
    /* Defaulting would wire local files into an app whose author asked for
       Axiom, and they would find out when production told them nothing. */
    expect(() => parseDrainArg('axium')).toThrow(/Unknown --drain "axium"/)
  })

  it('lists the known ids in the message so the fix is in the error', () => {
    expect(() => parseDrainArg('nope')).toThrow(/axiom/)
  })

  it('treats an absent flag as no opinion', () => {
    expect(parseDrainArg(undefined)).toBeUndefined()
    expect(parseDrainArg('')).toBeUndefined()
  })
})

describe('parseExtrasArg', () => {
  it('reads a comma-separated list and drops duplicates', () => {
    expect(parseExtrasArg('enrichers, sampling ,enrichers')).toEqual(['enrichers', 'sampling'])
  })

  it('refuses an unknown extra', () => {
    expect(() => parseExtrasArg('enrichers,telemetry')).toThrow(/Unknown --extras entry "telemetry"/)
  })
})

describe('resolveAnswers', () => {
  const base = {
    framework: 'nuxt' as const,
    defaultService: 'shop',
    evlogInstalled: false,
    install: true,
  }

  it('defaults to the local sink and no extras', () => {
    expect(resolveAnswers(base)).toEqual({
      framework: 'nuxt',
      service: 'shop',
      drain: 'fs',
      extras: [],
      install: true,
    })
  })

  it('never installs when evlog is already resolvable', () => {
    expect(resolveAnswers({ ...base, evlogInstalled: true }).install).toBe(false)
  })

  it('drops an extra the framework cannot use rather than failing the run', () => {
    /* `--extras vite,enrichers` across a monorepo of mixed frameworks should
       wire what fits each app instead of failing on the one that does not. */
    const input = { ...base, extras: ['vite' as const, 'enrichers' as const] }

    expect(resolveAnswers(input).extras).toEqual(['enrichers'])
    expect(droppedExtras(input)).toEqual(['vite'])
  })

  it('hides batching behind a drain that actually sends somewhere', () => {
    const input = { ...base, drain: 'fs' as const, extras: ['pipeline' as const] }

    expect(resolveAnswers(input).extras).toEqual([])
    expect(availableExtras('nuxt', 'axiom').map(extra => extra.id)).toContain('pipeline')
  })
})

describe('the catalog', () => {
  it('gives every destination a factory and specifier, or neither', () => {
    for (const destination of DESTINATIONS) {
      expect(Boolean(destination.specifier)).toBe(Boolean(destination.factory))
    }
  })

  it('marks only the filesystem drain as unsafe for production', () => {
    const unsafe = DESTINATIONS.filter(destination => !destination.productionSafe)
    expect(unsafe.map(destination => destination.id)).toEqual(['fs'])
  })

  it('keeps every extra reachable from at least one framework', () => {
    for (const extra of EXTRAS) {
      const reachable = (['nuxt', 'nitro', 'next', 'tanstack-start'] as const)
        .some(framework => availableExtras(framework, 'axiom').includes(extra))
      expect(reachable, `${extra.id} is offered nowhere`).toBe(true)
    }
  })

  it('points every destination at a docs path', () => {
    for (const destination of DESTINATIONS) {
      expect(destination.docs.startsWith('/'), destination.id).toBe(true)
    }
    expect(findDestination('axiom')?.env.map(v => v.name)).toEqual(['AXIOM_DATASET', 'AXIOM_API_KEY'])
  })
})

describe('canPrompt', () => {
  const ctx = (env: Record<string, string | undefined>) =>
    createContext({ cwd: '/tmp', env, nodeVersion: 'v22.0.0', tty: true, color: false, columns: 80 })

  it('refuses to prompt under CI even on a terminal', () => {
    /* An agent or a workflow runner must never end up waiting on a keystroke
       that is not coming. */
    expect(canPrompt(ctx({ CI: 'true' }))).toBe(false)
    expect(canPrompt(ctx({ CI: '1' }))).toBe(false)
  })

  it('ignores a CI variable that says it is off', () => {
    const stdin = process.stdin.isTTY
    const stdout = process.stdout.isTTY
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    try {
      expect(canPrompt(ctx({ CI: 'false' }))).toBe(true)
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: stdin, configurable: true })
      Object.defineProperty(process.stdout, 'isTTY', { value: stdout, configurable: true })
    }
  })

  it('refuses when stdin is not a terminal', () => {
    const stdin = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
    try {
      expect(canPrompt(ctx({}))).toBe(false)
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: stdin, configurable: true })
    }
  })
})
