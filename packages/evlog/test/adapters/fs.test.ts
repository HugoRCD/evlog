import { join } from 'node:path'
import { mkdir, appendFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WideEvent } from '../../src/types'

import { writeBatchToFs, writeToFs } from '../../src/adapters/fs'

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  appendFile: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn().mockRejectedValue(new Error('ENOENT')),
  unlink: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}))

const mockedMkdir = vi.mocked(mkdir)
const mockedAppendFile = vi.mocked(appendFile)
const mockedReaddir = vi.mocked(readdir)
const mockedStat = vi.mocked(stat)
const mockedUnlink = vi.mocked(unlink)
const mockedWriteFile = vi.mocked(writeFile)

describe('fs adapter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-14T10:00:00.000Z'))
    vi.clearAllMocks()
    mockedMkdir.mockResolvedValue(undefined)
    mockedAppendFile.mockResolvedValue(undefined)
    mockedReaddir.mockResolvedValue([])
    mockedStat.mockRejectedValue(new Error('ENOENT'))
    mockedUnlink.mockResolvedValue(undefined)
    mockedWriteFile.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const createTestEvent = (overrides?: Partial<WideEvent>): WideEvent => ({
    timestamp: '2026-03-14T10:00:00.000Z',
    level: 'info',
    service: 'test-service',
    environment: 'test',
    ...overrides,
  })

  describe('gitignore', () => {
    it('creates .gitignore inside .evlog/ directory on first write', async () => {
      await writeToFs(createTestEvent(), { dir: '.evlog/test-logs-1', pretty: false })

      expect(mockedWriteFile).toHaveBeenCalledWith(
        join('.evlog', '.gitignore'),
        '*\n',
        'utf-8',
      )
    })

    it('places .gitignore at the .evlog ancestor in monorepo paths', async () => {
      await writeToFs(createTestEvent(), { dir: 'apps/web/.evlog/logs', pretty: false })

      expect(mockedWriteFile).toHaveBeenCalledWith(
        join('apps/web/.evlog', '.gitignore'),
        '*\n',
        'utf-8',
      )
    })

    it('places .gitignore in dir itself when path has no .evlog segment', async () => {
      await writeToFs(createTestEvent(), { dir: '/tmp/custom-logs', pretty: false })

      expect(mockedWriteFile).toHaveBeenCalledWith(
        join('/tmp/custom-logs', '.gitignore'),
        '*\n',
        'utf-8',
      )
    })

    it('skips .gitignore creation when it already exists', async () => {
      mockedStat.mockResolvedValueOnce({} as any)

      await writeToFs(createTestEvent(), { dir: 'other/.evlog/logs', pretty: false })

      expect(mockedWriteFile).not.toHaveBeenCalled()
    })
  })

  describe('writeToFs', () => {
    it('creates directory and writes event as NDJSON', async () => {
      const event = createTestEvent({ action: 'test' })

      await writeToFs(event, { dir: '.evlog/logs', pretty: false })

      expect(mockedMkdir).toHaveBeenCalledWith('.evlog/logs', { recursive: true })
      expect(mockedAppendFile).toHaveBeenCalledTimes(1)

      const [filePath, content] = mockedAppendFile.mock.calls[0] as [string, string, string]
      expect(filePath).toBe(join('.evlog/logs', '2026-03-14.jsonl'))
      expect(content).toBe(`${JSON.stringify(event) }\n`)
    })

    it('writes pretty JSON when pretty option is true', async () => {
      const event = createTestEvent()

      await writeToFs(event, { dir: '.evlog/logs', pretty: true })

      const [, content] = mockedAppendFile.mock.calls[0] as [string, string, string]
      expect(content).toBe(`${JSON.stringify(event, null, 2) }\n`)
    })

    it('uses date-based filename', async () => {
      vi.setSystemTime(new Date('2025-12-25T15:30:00.000Z'))

      await writeToFs(createTestEvent(), { dir: 'logs', pretty: false })

      const [filePath] = mockedAppendFile.mock.calls[0] as [string, string, string]
      expect(filePath).toBe(join('logs', '2025-12-25.jsonl'))
    })
  })

  describe('writeBatchToFs', () => {
    it('writes multiple events as NDJSON lines', async () => {
      const events = [
        createTestEvent({ requestId: '1' }),
        createTestEvent({ requestId: '2' }),
        createTestEvent({ requestId: '3' }),
      ]

      await writeBatchToFs(events, { dir: '.evlog/logs', pretty: false })

      expect(mockedAppendFile).toHaveBeenCalledTimes(1)
      const [, content] = mockedAppendFile.mock.calls[0] as [string, string, string]
      const lines = content.trimEnd().split('\n')
      expect(lines).toHaveLength(3)

      for (const line of lines) {
        const parsed = JSON.parse(line)
        expect(parsed.service).toBe('test-service')
      }
    })

    it('skips write when events array is empty', async () => {
      await writeBatchToFs([], { dir: '.evlog/logs', pretty: false })

      expect(mockedMkdir).not.toHaveBeenCalled()
      expect(mockedAppendFile).not.toHaveBeenCalled()
    })

    it('uses custom directory', async () => {
      await writeBatchToFs([createTestEvent()], { dir: '/var/log/app', pretty: false })

      expect(mockedMkdir).toHaveBeenCalledWith('/var/log/app', { recursive: true })
      const [filePath] = mockedAppendFile.mock.calls[0] as [string, string, string]
      expect(filePath).toBe(join('/var/log/app', '2026-03-14.jsonl'))
    })
  })

  describe('file rotation (maxSizePerFile)', () => {
    it('uses base file when under size limit', async () => {
      mockedStat.mockResolvedValueOnce({ size: 500 } as any)

      await writeToFs(createTestEvent(), {
        dir: '.evlog/logs',
        pretty: false,
        maxSizePerFile: 1024,
      })

      const [filePath] = mockedAppendFile.mock.calls[0] as [string, string, string]
      expect(filePath).toBe(join('.evlog/logs', '2026-03-14.jsonl'))
    })

    it('rotates to suffixed file when base file exceeds size limit', async () => {
      mockedStat
        .mockResolvedValueOnce({ size: 2048 } as any)
        .mockRejectedValueOnce(new Error('ENOENT'))

      await writeToFs(createTestEvent(), {
        dir: '.evlog/logs',
        pretty: false,
        maxSizePerFile: 1024,
      })

      const [filePath] = mockedAppendFile.mock.calls[0] as [string, string, string]
      expect(filePath).toBe(join('.evlog/logs', '2026-03-14.1.jsonl'))
    })

    it('skips full rotated files and finds next available', async () => {
      mockedStat
        .mockResolvedValueOnce({ size: 2048 } as any)
        .mockResolvedValueOnce({ size: 2048 } as any)
        .mockResolvedValueOnce({ size: 2048 } as any)
        .mockRejectedValueOnce(new Error('ENOENT'))

      await writeToFs(createTestEvent(), {
        dir: '.evlog/logs',
        pretty: false,
        maxSizePerFile: 1024,
      })

      const [filePath] = mockedAppendFile.mock.calls[0] as [string, string, string]
      expect(filePath).toBe(join('.evlog/logs', '2026-03-14.3.jsonl'))
    })

    it('uses base file when stat fails (new file)', async () => {
      await writeToFs(createTestEvent(), {
        dir: '.evlog/logs',
        pretty: false,
        maxSizePerFile: 1024,
      })

      const [filePath] = mockedAppendFile.mock.calls[0] as [string, string, string]
      expect(filePath).toBe(join('.evlog/logs', '2026-03-14.jsonl'))
    })
  })

  describe('cleanup (maxFiles)', () => {
    it('deletes oldest files when exceeding maxFiles', async () => {
      mockedReaddir.mockResolvedValueOnce([
        '2026-03-10.jsonl',
        '2026-03-11.jsonl',
        '2026-03-12.jsonl',
        '2026-03-13.jsonl',
        '2026-03-14.jsonl',
      ] as any)

      await writeToFs(createTestEvent(), {
        dir: '.evlog/logs',
        pretty: false,
        maxFiles: 3,
      })

      expect(mockedUnlink).toHaveBeenCalledTimes(2)
      expect(mockedUnlink).toHaveBeenCalledWith(join('.evlog/logs', '2026-03-10.jsonl'))
      expect(mockedUnlink).toHaveBeenCalledWith(join('.evlog/logs', '2026-03-11.jsonl'))
    })

    it('does not delete files when under maxFiles limit', async () => {
      mockedReaddir.mockResolvedValueOnce([
        '2026-03-13.jsonl',
        '2026-03-14.jsonl',
      ] as any)

      await writeToFs(createTestEvent(), {
        dir: '.evlog/logs',
        pretty: false,
        maxFiles: 5,
      })

      expect(mockedUnlink).not.toHaveBeenCalled()
    })

    it('ignores non-jsonl files during cleanup', async () => {
      mockedReaddir.mockResolvedValueOnce([
        '2026-03-10.jsonl',
        '2026-03-11.jsonl',
        '2026-03-12.jsonl',
        'README.md',
        '.gitkeep',
      ] as any)

      await writeToFs(createTestEvent(), {
        dir: '.evlog/logs',
        pretty: false,
        maxFiles: 2,
      })

      expect(mockedUnlink).toHaveBeenCalledTimes(1)
      expect(mockedUnlink).toHaveBeenCalledWith(join('.evlog/logs', '2026-03-10.jsonl'))
    })

    it('does not run cleanup when maxFiles is not set', async () => {
      await writeToFs(createTestEvent(), {
        dir: '.evlog/logs',
        pretty: false,
      })

      expect(mockedReaddir).not.toHaveBeenCalled()
    })
  })
})
