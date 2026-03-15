import { describe, expect, it } from 'vitest'
import { createClientInjectPlugin } from '../../src/vite/client-inject'

describe('vite client-inject plugin', () => {
  it('injects script tag with initLog call', () => {
    const plugin = createClientInjectPlugin({ service: 'my-app' })
    const { configResolved } = (plugin as any)
    configResolved({ command: 'serve' })

    const result = (plugin as any).transformIndexHtml()
    expect(result).toHaveLength(1)
    expect(result[0].tag).toBe('script')
    expect(result[0].attrs.type).toBe('module')
    expect(result[0].children).toContain('initLog')
    expect(result[0].children).toContain('my-app')
    expect(result[0].injectTo).toBe('head-prepend')
  })

  it('includes transport config', () => {
    const plugin = createClientInjectPlugin({
      transport: { enabled: true, endpoint: '/api/logs' },
    })
    const { configResolved } = (plugin as any)
    configResolved({ command: 'serve' })

    const result = (plugin as any).transformIndexHtml()
    expect(result[0].children).toContain('/api/logs')
  })

  it('defaults service to client', () => {
    const plugin = createClientInjectPlugin({})
    const { configResolved } = (plugin as any)
    configResolved({ command: 'serve' })

    const result = (plugin as any).transformIndexHtml()
    expect(result[0].children).toContain('client')
  })

  it('sets pretty based on dev mode', () => {
    const plugin = createClientInjectPlugin({})

    const { configResolved } = (plugin as any)
    configResolved({ command: 'serve' })
    const devResult = (plugin as any).transformIndexHtml()
    expect(devResult[0].children).toContain('"pretty":true')

    configResolved({ command: 'build' })
    const buildResult = (plugin as any).transformIndexHtml()
    expect(buildResult[0].children).toContain('"pretty":false')
  })

  it('imports from evlog/client', () => {
    const plugin = createClientInjectPlugin({ service: 'test' })
    const { configResolved } = (plugin as any)
    configResolved({ command: 'serve' })

    const result = (plugin as any).transformIndexHtml()
    expect(result[0].children).toContain('from\'evlog/client\'')
  })

  it('includes console: false in config when set', () => {
    const plugin = createClientInjectPlugin({ console: false })
    const { configResolved } = (plugin as any)
    configResolved({ command: 'serve' })

    const result = (plugin as any).transformIndexHtml()
    expect(result[0].children).toContain('"console":false')
  })

  it('omits console from config when not set', () => {
    const plugin = createClientInjectPlugin({})
    const { configResolved } = (plugin as any)
    configResolved({ command: 'serve' })

    const result = (plugin as any).transformIndexHtml()
    expect(result[0].children).not.toContain('"console"')
  })

  it('omits transport when not configured', () => {
    const plugin = createClientInjectPlugin({ service: 'app' })
    const { configResolved } = (plugin as any)
    configResolved({ command: 'serve' })

    const result = (plugin as any).transformIndexHtml()
    expect(result[0].children).not.toContain('transport')
  })
})
