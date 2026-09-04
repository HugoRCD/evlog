import type { SessionAuthContext } from 'eve/context'
import type { ApprovalStatus } from 'eve/tools/approval'
import { writePolicy } from './label-approval'

const DENIED: ApprovalStatus = {
  type: 'denied',
  reason: 'The GitHub channel already posts your reply as the comment on this thread. Put the reply in your final message; use this tool only for a different issue.',
}

const INPUT_NUMBER_KEYS = [
  'issueNumber',
  'issue_number',
  'pullRequestNumber',
  'pull_request_number',
] as const

const AUTH_NUMBER_KEYS = ['issue_number', 'pull_request_number'] as const

/**
 * On a GitHub-channel turn the reply is posted by `message.completed`, so
 * `addIssueComment` on this thread is a second comment. Other channels and a
 * comment aimed at a different issue still go through {@link writePolicy}.
 */
export function threadCommentPolicy(
  auth: SessionAuthContext | null,
  toolInput?: unknown,
): ApprovalStatus {
  if (auth?.authenticator !== 'github-webhook') return writePolicy(auth)
  const current = threadNumbersFromAuth(auth)
  if (current.size === 0) return DENIED
  const target = issueNumberFromInput(toolInput)
  if (target === null || current.has(target)) return DENIED
  return writePolicy(auth)
}

export function threadNumbersFromAuth(auth: SessionAuthContext | null): Set<number> {
  const numbers = new Set<number>()
  if (auth === null) return numbers
  const attributes = auth.attributes as Record<string, unknown>
  for (const key of AUTH_NUMBER_KEYS) {
    const parsed = parseIssueNumber(attributes[key])
    if (parsed !== null) numbers.add(parsed)
  }
  return numbers
}

export function issueNumberFromInput(toolInput: unknown): number | null {
  if (toolInput === null || toolInput === undefined || typeof toolInput !== 'object') return null
  const input = toolInput as Record<string, unknown>
  for (const key of INPUT_NUMBER_KEYS) {
    const parsed = parseIssueNumber(input[key])
    if (parsed !== null) return parsed
  }
  return null
}

function parseIssueNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value)
    return parsed > 0 ? parsed : null
  }
  return null
}
