import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/shared/nitroConfigBridge', () => ({
  getNitroRuntimeConfigRecord: vi.fn(),
}))

import { resolveAdapterConfig } from '../../src/shared/config'
import { getNitroRuntimeConfigRecord } from '../../src/shared/nitroConfigBridge'

interface TestAdapterConfig {
  apiKey?: string
  endpoint?: string
  site?: string
  timeout?: number
}

describe('resolveAdapterConfig', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('skips the Nitro runtime probe when overrides and env already satisfy env-backed fields', async () => {
    const runtimeProbe = vi.mocked(getNitroRuntimeConfigRecord)
    runtimeProbe.mockResolvedValue({
      evlog: {
        test: {
          timeout: 30_000,
        },
      },
    })

    const config = await resolveAdapterConfig<TestAdapterConfig>(
      'test',
      [
        { key: 'apiKey', env: ['TEST_API_KEY'] },
        { key: 'endpoint', env: ['TEST_ENDPOINT'] },
        { key: 'timeout' },
      ],
      {
        apiKey: 'override-key',
        endpoint: 'https://override.example.com',
      },
    )

    expect(runtimeProbe).not.toHaveBeenCalled()
    expect(config).toEqual({
      apiKey: 'override-key',
      endpoint: 'https://override.example.com',
      timeout: undefined,
    })
  })

  it('skips the Nitro runtime probe when env alone satisfies the remaining env-backed fields', async () => {
    vi.stubEnv('TEST_API_KEY', 'env-key')
    vi.stubEnv('TEST_ENDPOINT', 'https://env.example.com')

    const runtimeProbe = vi.mocked(getNitroRuntimeConfigRecord)

    const config = await resolveAdapterConfig<TestAdapterConfig>(
      'test',
      [
        { key: 'apiKey', env: ['TEST_API_KEY'] },
        { key: 'endpoint', env: ['TEST_ENDPOINT'] },
        { key: 'timeout' },
      ],
    )

    expect(runtimeProbe).not.toHaveBeenCalled()
    expect(config).toEqual({
      apiKey: 'env-key',
      endpoint: 'https://env.example.com',
      timeout: undefined,
    })
  })

  it('probes Nitro runtime config when an env-backed field is still unresolved', async () => {
    const runtimeProbe = vi.mocked(getNitroRuntimeConfigRecord)
    runtimeProbe.mockResolvedValue({
      evlog: {
        test: {
          apiKey: 'runtime-key',
          endpoint: 'https://runtime.example.com',
        },
      },
      test: {
        endpoint: 'https://root.example.com',
        timeout: 15_000,
      },
    })

    const config = await resolveAdapterConfig<TestAdapterConfig>(
      'test',
      [
        { key: 'apiKey', env: ['TEST_API_KEY'] },
        { key: 'endpoint', env: ['TEST_ENDPOINT'] },
        { key: 'timeout' },
      ],
    )

    expect(runtimeProbe).toHaveBeenCalledTimes(1)
    expect(config).toEqual({
      apiKey: 'runtime-key',
      endpoint: 'https://runtime.example.com',
      timeout: 15_000,
    })
  })

  it('preserves override then runtime then env precedence when the probe is required', async () => {
    vi.stubEnv('TEST_API_KEY', 'env-key')
    vi.stubEnv('TEST_ENDPOINT', 'https://env.example.com')

    const runtimeProbe = vi.mocked(getNitroRuntimeConfigRecord)
    runtimeProbe.mockResolvedValue({
      evlog: {
        test: {
          apiKey: 'runtime-key',
          endpoint: 'https://runtime.example.com',
          site: 'runtime-site',
        },
      },
      test: {
        endpoint: 'https://root.example.com',
        timeout: 5_000,
      },
    })

    const config = await resolveAdapterConfig<TestAdapterConfig>(
      'test',
      [
        { key: 'apiKey', env: ['TEST_API_KEY'] },
        { key: 'endpoint', env: ['TEST_ENDPOINT'] },
        { key: 'site', env: ['TEST_SITE'] },
        { key: 'timeout' },
      ],
      {
        apiKey: 'override-key',
      },
    )

    expect(runtimeProbe).toHaveBeenCalledTimes(1)
    expect(config).toEqual({
      apiKey: 'override-key',
      endpoint: 'https://runtime.example.com',
      site: 'runtime-site',
      timeout: 5_000,
    })
  })
})
