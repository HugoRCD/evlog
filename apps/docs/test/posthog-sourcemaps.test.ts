import { describe, expect, it, vi } from 'vitest'
import {
  DOCS_POSTHOG_CLI_HOST,
  DOCS_POSTHOG_PROJECT_ID,
  decideSourceMapUpload,
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
    expect(sourcemapCliArgs(DOCS_POSTHOG_CLI_HOST)).toEqual({
      inject: ['--host', 'https://eu.posthog.com', 'sourcemap', 'inject', '--directory', '.output'],
      upload: ['--host', 'https://eu.posthog.com', 'sourcemap', 'upload', '--directory', '.output', '--delete-after'],
    })
  })
})

describe('uploadDocsSourceMaps', () => {
  it('does not invoke the CLI without a key', () => {
    const exec = vi.fn()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(uploadDocsSourceMaps({ VERCEL_ENV: 'production' }, exec)).toBe('skip-no-key')
    expect(exec).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith('[posthog] POSTHOG_CLI_API_KEY is unset; docs source maps were not uploaded')
    error.mockRestore()
  })

  it('runs inject then upload against the EU project', () => {
    const exec = vi.fn()
    expect(uploadDocsSourceMaps({
      POSTHOG_CLI_API_KEY: 'phx_test',
      VERCEL_ENV: 'production',
    }, exec)).toBe('upload')
    expect(exec).toHaveBeenCalledTimes(2)
    expect(exec.mock.calls[0]![0]).toBe('posthog-cli')
    expect(exec.mock.calls[0]![1]).toEqual(sourcemapCliArgs(DOCS_POSTHOG_CLI_HOST).inject)
    expect(exec.mock.calls[1]![1]).toEqual(sourcemapCliArgs(DOCS_POSTHOG_CLI_HOST).upload)
    expect(exec.mock.calls[0]![2].env.POSTHOG_CLI_PROJECT_ID).toBe(DOCS_POSTHOG_PROJECT_ID)
    expect(exec.mock.calls[0]![2].env.POSTHOG_CLI_HOST).toBe(DOCS_POSTHOG_CLI_HOST)
  })
})
