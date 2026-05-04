import { bench, describe } from 'vitest'
import type { EvlogPlugin } from '../../src/shared/plugin'
import { definePlugin } from '../../src/shared/plugin'
import { createMiddlewareLogger, resolveMiddlewarePluginRunner } from '../../src/shared/middleware'
import { initSilentLogger } from './_fixtures'

initSilentLogger()

const noopPluginA: EvlogPlugin = definePlugin({
  name: 'bench-a',
  enrich({ event }) {
    event.benchA = true
  },
})

const noopPluginB: EvlogPlugin = definePlugin({
  name: 'bench-b',
  drain() {
    /* drop */
  },
})

const noopPluginC: EvlogPlugin = definePlugin({
  name: 'bench-c',
  onRequestStart() {},
  onRequestFinish() {},
})

const optionsNoPlugins = {} as const
const optionsTwoPlugins = { plugins: [noopPluginA, noopPluginB] }
const optionsThreePlugins = { plugins: [noopPluginA, noopPluginB, noopPluginC] }

const safeHeaders: Record<string, string> = {
  'user-agent': 'Mozilla/5.0',
  'accept-encoding': 'gzip, br',
  'x-forwarded-for': '203.0.113.42',
}

describe('resolveMiddlewarePluginRunner (cached hot path)', () => {
  bench('no local plugins (returns global empty runner)', () => {
    resolveMiddlewarePluginRunner(optionsNoPlugins)
  })

  bench('2 local plugins (cached after first call)', () => {
    resolveMiddlewarePluginRunner(optionsTwoPlugins)
  })

  bench('3 local plugins (cached after first call)', () => {
    resolveMiddlewarePluginRunner(optionsThreePlugins)
  })
})

describe('createMiddlewareLogger (full per-request setup)', () => {
  bench('no plugins, no headers', () => {
    const result = createMiddlewareLogger({
      method: 'GET',
      path: '/api/users',
    })
    if (!result.skipped) result.logger.set({ user: { id: 'u_1' } })
  })

  bench('no plugins, safe headers', () => {
    const result = createMiddlewareLogger({
      method: 'GET',
      path: '/api/users',
      headers: safeHeaders,
    })
    if (!result.skipped) result.logger.set({ user: { id: 'u_1' } })
  })

  bench('2 plugins (cached merge)', () => {
    const result = createMiddlewareLogger({
      method: 'POST',
      path: '/api/checkout',
      headers: safeHeaders,
      plugins: optionsTwoPlugins.plugins,
    })
    if (!result.skipped) result.logger.set({ user: { id: 'u_1' } })
  })
})

describe('full request lifecycle (createMiddlewareLogger → set → finish)', () => {
  bench('no plugins, no drain', async () => {
    const { logger, finish, skipped } = createMiddlewareLogger({
      method: 'POST',
      path: '/api/checkout',
      headers: safeHeaders,
    })
    if (skipped) return
    logger.set({ user: { id: 'u_1' }, cart: { items: 3 } })
    await finish({ status: 200 })
  })

  bench('2 plugins, sync drain', async () => {
    const { logger, finish, skipped } = createMiddlewareLogger({
      method: 'POST',
      path: '/api/checkout',
      headers: safeHeaders,
      plugins: optionsTwoPlugins.plugins,
      drain: () => {},
    })
    if (skipped) return
    logger.set({ user: { id: 'u_1' }, cart: { items: 3 } })
    await finish({ status: 200 })
  })
})
