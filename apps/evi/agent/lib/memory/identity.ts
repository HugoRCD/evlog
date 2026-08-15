import { and, eq } from 'drizzle-orm'
import type { SessionAuthContext } from 'eve/context'
import type { Surface } from '../../../db/schema'
import { identities, people } from '../../../db/schema'
import type { getDb } from '../db'
import { isMaintainer, MAINTAINER_GITHUB_LOGIN, MAINTAINER_PRINCIPALS } from '../trust'

type Db = NonNullable<ReturnType<typeof getDb>>

const SURFACES: ReadonlySet<string> = new Set<Surface>([
  'github', 'linear', 'imessage', 'mcp', 'cloud', 'local',
])

export interface ExternalIdentity {
  surface: Surface
  externalId: string
}

/**
 * Splits a principal id into the surface it came from and the id on it.
 *
 * eve principals are `<surface>:<id>`, and the id half may itself contain
 * colons, so the split is on the first one only. An unknown prefix returns null
 * rather than inventing a surface: an identity row is a join key, and a wrong
 * one merges two people.
 */
export function parsePrincipal(principalId: string | undefined): ExternalIdentity | null {
  if (principalId === undefined) return null
  const separator = principalId.indexOf(':')
  if (separator <= 0) return null

  const surface = principalId.slice(0, separator)
  const externalId = principalId.slice(separator + 1)
  if (externalId.length === 0 || !SURFACES.has(surface)) return null
  return { surface: surface as Surface, externalId }
}

/**
 * The surface a channel kind belongs to.
 *
 * `photon` is the iMessage channel, and the mapping matters: `trust.ts` mints
 * `imessage:<phone>` principals, so a source recorded as `photon` would not
 * line up with the identity rows seeded from them.
 */
const CHANNEL_SURFACES: Readonly<Record<string, Surface>> = {
  github: 'github',
  linear: 'linear',
  photon: 'imessage',
  mcp: 'mcp',
}

export function surfaceOf(channel: string): Surface {
  return CHANNEL_SURFACES[channel] ?? 'local'
}

/** Every principal `trust.ts` recognizes as Hugo, as identity rows. */
export function maintainerIdentities(): ExternalIdentity[] {
  return [...MAINTAINER_PRINCIPALS]
    .map(parsePrincipal)
    .filter((identity): identity is ExternalIdentity => identity !== null)
}

async function findPerson(db: Db, tenantId: string, identity: ExternalIdentity) {
  const [row] = await db
    .select({ id: identities.personId })
    .from(identities)
    .where(and(
      eq(identities.tenantId, tenantId),
      eq(identities.surface, identity.surface),
      eq(identities.externalId, identity.externalId),
    ))
    .limit(1)
  return row?.id ?? null
}

/**
 * Creates the maintainer person with every principal `trust.ts` knows, so a
 * preference stated on iMessage is readable on GitHub whichever surface Evi
 * happened to meet first. Idempotent: seeding runs on first contact rather than
 * in the migration, so it picks up an environment variable added later.
 */
async function seedMaintainer(db: Db, tenantId: string): Promise<string | null> {
  const rows = maintainerIdentities()
  if (rows.length === 0) return null

  for (const identity of rows) {
    const existing = await findPerson(db, tenantId, identity)
    if (existing !== null) {
      await db.insert(identities).values(
        rows.map(row => ({ ...row, personId: existing, tenantId })),
      ).onConflictDoNothing()
      return existing
    }
  }

  const [person] = await db
    .insert(people)
    .values({ tenantId, displayName: MAINTAINER_GITHUB_LOGIN, role: 'maintainer' })
    .returning({ id: people.id })
  if (person === undefined) return null

  await db.insert(identities).values(
    rows.map(row => ({ ...row, personId: person.id, tenantId })),
  ).onConflictDoNothing()
  return person.id
}

/**
 * A principal's person id never changes, and this runs on every turn through
 * the tool resolver. Without the cache the maintainer path costs a seed pass
 * against the database before the first token of every reply.
 */
const resolved = new Map<string, string | null>()

/**
 * The person id for this session's caller, or null when there is none to
 * resolve. Callers treat null as "no person realm", never as an error: a
 * missing person costs memory, not the turn.
 */
export async function resolvePersonId(
  db: Db,
  tenantId: string,
  auth: SessionAuthContext | null,
): Promise<string | null> {
  const key = `${tenantId}:${auth?.principalId ?? 'anonymous'}`
  const cached = resolved.get(key)
  if (cached !== undefined) return cached

  const personId = isMaintainer(auth)
    ? await seedMaintainer(db, tenantId)
    : await findPersonForCaller(db, tenantId, auth)

  // A miss is only cached once a person exists to find; caching "no person"
  // would outlive the seed that creates one.
  if (personId !== null) resolved.set(key, personId)
  return personId
}

async function findPersonForCaller(
  db: Db,
  tenantId: string,
  auth: SessionAuthContext | null,
): Promise<string | null> {
  const identity = parsePrincipal(auth?.principalId)
  if (identity === null) return null
  return await findPerson(db, tenantId, identity)
}
