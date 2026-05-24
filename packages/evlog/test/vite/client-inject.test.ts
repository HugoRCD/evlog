import { describe, expect, it } from 'vitest'
import type { HtmlTagDescriptor, Plugin } from 'vite'
import { defined } from '../helpers/defined'
import { callConfigResolved, getPluginHook } from '../helpers/vite'
import { createClientInjectPlugin } from '../../src/vite/client-inject'

function runTransformIndexHtml(
  plugin: Plugin,
  command: 'serve' | 'build' = 'serve',
): HtmlTagDescriptor[] {
  callConfigResolved(plugin, { command })
  type TransformIndexHtmlHook = () => HtmlTagDescriptor | HtmlTagDescriptor[] | null | undefined
  const tags = getPluginHook<TransformIndexHtmlHook>(plugin, 'transformIndexHtml')()
  return defined(Array.isArray(tags) ? tags : tags ? [tags] : undefined, 'transformIndexHtml tags')
}

describe('vite client-inject plugin', () => {
  it('injects script tag with initLog call', () => {
    const plugin = createClientInjectPlugin({ service: 'my-app' })
    const result = runTransformIndexHtml(plugin)
    expect(result).toHaveLength(1)
    expect(result[0].tag).toBe('script')
    expect(result[0].attrs?.type).toBe('module')
    expect(result[0].children).toContain('initLog')
    expect(result[0].children).toContain('my-app')
    expect(result[0].injectTo).toBe('head-prepend')
  })

  it('includes transport config', () => {
    const plugin = createClientInjectPlugin({
      transport: { enabled: true, endpoint: '/api/logs' },
    })
    const result = runTransformIndexHtml(plugin)
    expect(result[0].children).toContain('/api/logs')
  })

  it('defaults service to client', () => {
    const plugin = createClientInjectPlugin({})
    const result = runTransformIndexHtml(plugin)
    expect(result[0].children).toContain('client')
  })

  it('sets pretty based on dev mode', () => {
    const plugin = createClientInjectPlugin({})

    const devResult = runTransformIndexHtml(plugin, 'serve')
    expect(devResult[0].children).toContain('"pretty":true')

    const buildResult = runTransformIndexHtml(plugin, 'build')
    expect(buildResult[0].children).toContain('"pretty":false')
  })

  it('imports from evlog/client', () => {
    const plugin = createClientInjectPlugin({ service: 'test' })
    const result = runTransformIndexHtml(plugin)
    expect(result[0].children).toContain('from\'evlog/client\'')
  })

  it('includes console: false in config when set', () => {
    const plugin = createClientInjectPlugin({ console: false })
    const result = runTransformIndexHtml(plugin)
    expect(result[0].children).toContain('"console":false')
  })

  it('omits console from config when not set', () => {
    const plugin = createClientInjectPlugin({})
    const result = runTransformIndexHtml(plugin)
    expect(result[0].children).not.toContain('"console"')
  })

  it('omits transport when not configured', () => {
    const plugin = createClientInjectPlugin({ service: 'app' })
    const result = runTransformIndexHtml(plugin)
    expect(result[0].children).not.toContain('transport')
  })
})
