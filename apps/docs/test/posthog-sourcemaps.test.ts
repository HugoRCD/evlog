import { describe, expect, it, vi } from 'vitest'
import {
  DOCS_POSTHOG_CLI_HOST,
  DOCS_POSTHOG_PROJECT_ID,
  SOURCEMAP_DIRECTORY,
  decideSourceMapUpload,
  resolvePosthogCli,
  sourcemapCliArgs,
  uploadDocsSourceMaps,
} from '../config/posthog-sourcemaps'

describe('decideSourceMapUpload', () => {
  it('skips when the personal API key is missing', () => {
    expect(decideSourceMapUpload({ VERCEL_ENV: 'production' })).toBe('skip-no-key')
  })

  it('skips Vercel preview and development builds', () => {
    expect(decideSourceMapUpload({ POSTHOG_CLI_API_KEY: 'phx_test', VERCEL_ENV: 'preview' })).toBe('skip-not-production')
    expect(decideSourceMapUpload({ POSTHOG_CLI_API_KEY: 'phx_test', VERCEL_ENV: 'development' })).toBe('skip-not-production')
  })

  it('uploads on Vercel production when the key is set', () => {
    expect(decideSourceMapUpload({ POSTHOG_CLI_API_KEY: 'phx_test', VERCEL_ENV: 'production' })).toBe('upload')
  })

  it('uploads off Vercel when the key is set, so a local production build can verify', () => {
    expect(decideSourceMapUpload({ POSTHOG_CLI_API_KEY: 'phx_test' })).toBe('upload')
  })
})

describe('sourcemapCliArgs', () => {
  it('injects then uploads from .output and deletes maps after', () => {
    expect(sourcemapCliArgs(SOURCEMAP_DIRECTORY)).toEqual({
      inject: ['sourcemap', 'inject', '--directory', '.output'],
      upload: ['sourcemap', 'upload', '--directory', '.output', '--delete-after'],
    })
  })
})

describe('resolvePosthogCli', () => {
  it('resolves the packaged CLI entry', () => {
    expect(resolvePosthogCli()).toMatch(/run-posthog-cli\.js$/)
  })
})

describe('uploadDocsSourceMaps', () => {
  it('does not invoke the CLI without a key', () => {
    const exec = vi.fn()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(uploadDocsSourceMaps({ env: { VERCEL_ENV: 'production' }, exec })).toBe('skip-no-key')
    expect(exec).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith('[posthog] POSTHOG_CLI_API_KEY is unset; docs source maps were not uploaded')
    error.mockRestore()
  })

  it('does not invoke the CLI on Vercel preview', () => {
    const exec = vi.fn()
    expect(uploadDocsSourceMaps({
      env: { POSTHOG_CLI_API_KEY: 'phx_test', VERCEL_ENV: 'preview' },
      exec,
    })).toBe('skip-not-production')
    expect(exec).not.toHaveBeenCalled()
  })

  it('runs inject then upload against the EU project', () => {
    const exec = vi.fn()
    const cwd = '/tmp/evlog-docs'
    expect(uploadDocsSourceMaps({
      env: {
        POSTHOG_CLI_API_KEY: 'phx_test',
        VERCEL_ENV: 'production',
      },
      exec,
      cwd,
    })).toBe('upload')

    const cli = resolvePosthogCli()
    const args = sourcemapCliArgs(SOURCEMAP_DIRECTORY)
    expect(exec).toHaveBeenCalledTimes(2)
    expect(exec.mock.calls[0]).toEqual([
      process.execPath,
      [cli, ...args.inject],
      { cwd, env: expect.objectContaining({
        POSTHOG_CLI_API_KEY: 'phx_test',
        POSTHOG_CLI_HOST: DOCS_POSTHOG_CLI_HOST,
        POSTHOG_CLI_PROJECT_ID: DOCS_POSTHOG_PROJECT_ID,
      }), stdio: 'inherit' },
    ])
    expect(exec.mock.calls[1]?.[1]).toEqual([cli, ...args.upload])
  })

  it('forwards host and project overrides to the CLI env', () => {
    const exec = vi.fn()
    uploadDocsSourceMaps({
      env: {
        POSTHOG_CLI_API_KEY: 'phx_test',
        POSTHOG_CLI_HOST: 'https://us.posthog.com',
        POSTHOG_CLI_PROJECT_ID: '1',
        VERCEL_ENV: 'production',
      },
      exec,
    })
    expect(exec.mock.calls[0]?.[2].env.POSTHOG_CLI_HOST).toBe('https://us.posthog.com')
    expect(exec.mock.calls[0]?.[2].env.POSTHOG_CLI_PROJECT_ID).toBe('1')
  })
})
