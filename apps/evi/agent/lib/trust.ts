import type { SessionAuthContext } from 'eve/context'

/**
 * Hugo's identity on each channel, read from the environment so the public
 * repo carries no personal identifiers. A session whose current caller matches
 * one of these gets maintainer-level trust: routine repository writes run
 * without an approval card. A missing variable removes that channel from the
 * trusted set, so its writes fall back to asking.
 */
export const MAINTAINER_PHONE = process.env.MAINTAINER_PHONE

const MAINTAINER_PRINCIPALS = new Set(
  [
    process.env.MAINTAINER_GITHUB_ID && `github:${process.env.MAINTAINER_GITHUB_ID}`,
    process.env.MAINTAINER_LINEAR_ID && `linear:${process.env.MAINTAINER_LINEAR_ID}`,
    MAINTAINER_PHONE && `imessage:${MAINTAINER_PHONE}`,
  ].filter((principal): principal is string => Boolean(principal)),
)

export function isMaintainer(auth: SessionAuthContext | null): boolean {
  return auth !== null && MAINTAINER_PRINCIPALS.has(auth.principalId)
}
