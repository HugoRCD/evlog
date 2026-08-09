import { afterEach, describe, expect, it, vi } from 'vitest'
import { ESCALATION_LABEL, escalateFailedTriage, isAutonomousTriageState } from './escalate'

vi.mock('./credentials', () => ({
  githubCredentials: { installationToken: async () => 'tok_test' },
}))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isAutonomousTriageState', () => {
  it('recognizes an issue dispatch with no triggering comment', () => {
    expect(isAutonomousTriageState({ issueNumber: 12, triggeringCommentId: null })).toBe(true)
  })

  it('rejects mention comments and non-issue conversations', () => {
    expect(isAutonomousTriageState({ issueNumber: 12, triggeringCommentId: 34 })).toBe(false)
    expect(isAutonomousTriageState({ issueNumber: null, triggeringCommentId: null })).toBe(false)
  })
})

describe('escalateFailedTriage', () => {
  it('labels and assigns the issue, creating the label when missing', async () => {
    const calls: Array<{ url: string, method: string, body: unknown }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      if (String(url).includes('/labels/') && init?.method === undefined) {
        return new Response('not found', { status: 404 })
      }
      return new Response('{}', { status: 200 })
    }))

    await escalateFailedTriage(42)

    expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)).toEqual([
      `GET /repos/HugoRCD/evlog/labels/${encodeURIComponent(ESCALATION_LABEL)}`,
      'POST /repos/HugoRCD/evlog/labels',
      'POST /repos/HugoRCD/evlog/issues/42/labels',
      'POST /repos/HugoRCD/evlog/issues/42/assignees',
    ])
    expect(calls[2]?.body).toEqual({ labels: [ESCALATION_LABEL] })
    expect(calls[3]?.body).toEqual({ assignees: ['hugorcd'] })
  })

  it('skips label creation when the label exists', async () => {
    const methods: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      methods.push(`${init?.method ?? 'GET'} ${new URL(String(url)).pathname}`)
      return new Response('{}', { status: 200 })
    }))

    await escalateFailedTriage(7)

    expect(methods).toEqual([
      `GET /repos/HugoRCD/evlog/labels/${encodeURIComponent(ESCALATION_LABEL)}`,
      'POST /repos/HugoRCD/evlog/issues/7/labels',
      'POST /repos/HugoRCD/evlog/issues/7/assignees',
    ])
  })

  it('surfaces a failed GitHub call', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response('nope', { status: 403 })
      return new Response('{}', { status: 200 })
    }))
    await expect(escalateFailedTriage(7)).rejects.toThrow('failed (403)')
  })
})
