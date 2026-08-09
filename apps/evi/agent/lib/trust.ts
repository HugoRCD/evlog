import type { SessionAuthContext } from 'eve/context'

/**
 * Hugo's identity on each channel, read from the environment so the public
 * repo carries no personal identifiers. A session whose current caller matches
 * one of these gets maintainer-level trust: routine repository writes run
 * without an approval card. A missing variable removes that channel from the
 * trusted set, so its writes fall back to asking.
 */
export const MAINTAINER_PHONE = process.env.MAINTAINER_PHONE
export const MAINTAINER_GITHUB_ID = process.env.MAINTAINER_GITHUB_ID
/** Hugo's GitHub login, used to assign escalated issues to him. Public handle, not a credential. */
export const MAINTAINER_GITHUB_LOGIN = 'hugorcd'

const MAINTAINER_PRINCIPALS = new Set(
  [
    MAINTAINER_GITHUB_ID && `github:${MAINTAINER_GITHUB_ID}`,
    process.env.MAINTAINER_LINEAR_ID && `linear:${process.env.MAINTAINER_LINEAR_ID}`,
    MAINTAINER_PHONE && `imessage:${MAINTAINER_PHONE}`,
  ].filter((principal): principal is string => Boolean(principal)),
)

export function isMaintainer(auth: SessionAuthContext | null): boolean {
  return auth !== null && MAINTAINER_PRINCIPALS.has(auth.principalId)
}

/**
 * The constructed principal for unattended GitHub turns (first responder on
 * new issues). Projected actors always carry a numeric `github:<id>`, so this
 * fixed login cannot collide with a real one.
 */
export const AUTONOMOUS_GITHUB_PRINCIPAL = 'github:evlogai'

/** Unattended turns: comment-only, never trusted, nothing may park on a card. */
export function isAutonomous(auth: SessionAuthContext | null): boolean {
  return auth !== null && auth.principalId === AUTONOMOUS_GITHUB_PRINCIPAL
}

/**
 * Sessions allowed to reach the admin observability tools (Vercel MCP, AI
 * Gateway spend): maintainers, plus app-principal sessions such as schedules,
 * which carry no user identity. The weekly self-review runs from a schedule.
 */
export function canAccessAdminTools(auth: SessionAuthContext | null): boolean {
  return isMaintainer(auth) || isScheduleAppAuth(auth)
}

/**
 * The app principal eve stamps on schedule-dispatched turns (eve
 * `channel/schedule-auth`). Schedule turns may push feature branches so the
 * upstream-sync run can deliver its PRs; they are never a user identity and
 * can never touch main.
 */
export function isScheduleAppAuth(auth: SessionAuthContext | null): boolean {
  return auth !== null
    && auth.authenticator === 'app'
    && auth.principalId === 'eve:app'
    && auth.principalType === 'runtime'
}
