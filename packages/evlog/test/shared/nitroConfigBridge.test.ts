import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  delete process.env.__EVLOG_CONFIG
})

afterEach(() => {
  vi.resetModules()
  vi.doUnmock(['nitro', 'runtime-config'].join('/'))
  vi.doUnmock(['nitropack', 'runtime', 'internal', 'config'].join('/'))
  vi.doUnmock(['nitropack', 'runtime'].join('/'))
})

async function loadBridgeWithMocks() {
  const importSpy = vi.fn<(specifier: string) => void>()
  vi.doMock(['nitro', 'runtime-config'].join('/'), () => {
    importSpy('nitro/runtime-config')
    return { useRuntimeConfig: () => ({ evlog: { env: { service: 'svc-v3' } }, posthog: { apiKey: 'phc-v3' } }) }
  })
  vi.doMock(['nitropack', 'runtime', 'internal', 'config'].join('/'), () => {
    importSpy('nitropack/runtime/internal/config')
    return { useRuntimeConfig: () => ({ evlog: { env: { service: 'svc-v2' } }, posthog: { apiKey: 'phc-v2' } }) }
  })
  vi.doMock(['nitropack', 'runtime'].join('/'), () => {
    importSpy('nitropack/runtime')
    return { useRuntimeConfig: () => ({ evlog: { env: { service: 'svc-v2-barrel' } }, posthog: { apiKey: 'phc-v2-barrel' } }) }
  })
  const bridge = await import('../../src/shared/nitroConfigBridge')
  return { bridge, importSpy }
}

describe('nitroConfigBridge — active runtime', () => {
  it('only probes Nitro v3 modules when v3 is the active runtime', async () => {
    const { bridge, importSpy } = await loadBridgeWithMocks()
    bridge.setActiveNitroRuntime('v3')

    const config = await bridge.resolveEvlogConfigForNitroPlugin()
    const record = await bridge.getNitroRuntimeConfigRecord()

    expect(config).toEqual({ env: { service: 'svc-v3' } })
    expect(record).toEqual({ evlog: { env: { service: 'svc-v3' } }, posthog: { apiKey: 'phc-v3' } })

    const probed = importSpy.mock.calls.map(call => call[0])
    expect(probed).toContain('nitro/runtime-config')
    expect(probed).not.toContain('nitropack/runtime')
    expect(probed).not.toContain('nitropack/runtime/internal/config')
  })

  it('only probes nitropack v2 modules when v2 is the active runtime', async () => {
    const { bridge, importSpy } = await loadBridgeWithMocks()
    bridge.setActiveNitroRuntime('v2')

    const config = await bridge.resolveEvlogConfigForNitroPlugin()
    const record = await bridge.getNitroRuntimeConfigRecord()

    expect(config).toEqual({ env: { service: 'svc-v2' } })
    expect(record).toEqual({ evlog: { env: { service: 'svc-v2-barrel' } }, posthog: { apiKey: 'phc-v2-barrel' } })

    const probed = importSpy.mock.calls.map(call => call[0])
    expect(probed).not.toContain('nitro/runtime-config')
  })

  it('reads __EVLOG_CONFIG from env without probing any Nitro module', async () => {
    process.env.__EVLOG_CONFIG = JSON.stringify({ env: { service: 'svc-env' } })
    const { bridge, importSpy } = await loadBridgeWithMocks()
    bridge.setActiveNitroRuntime('v3')

    const config = await bridge.resolveEvlogConfigForNitroPlugin()

    expect(config).toEqual({ env: { service: 'svc-env' } })
    expect(importSpy).not.toHaveBeenCalled()
  })

  it('falls back to historical probe order when no runtime is declared', async () => {
    const { bridge, importSpy } = await loadBridgeWithMocks()
    bridge.resetActiveNitroRuntime()

    const config = await bridge.resolveEvlogConfigForNitroPlugin()

    expect(config).toEqual({ env: { service: 'svc-v3' } })
    const probed = importSpy.mock.calls.map(call => call[0])
    expect(probed).toContain('nitro/runtime-config')
  })
})
