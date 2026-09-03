import { and, eq } from 'drizzle-orm'
import type { SessionAuthContext } from 'eve/context'
import type { Surface } from '../../../db/schema'
import { identities, people } from '../../../db/schema'
import type { getDb } from '../db'
import { isMaintainer, MAINTAINER_GITHUB_LOGIN, MAINTAINER_PRINCIPALS } from '../trust'

type Db = NonNullable<ReturnType<typeof getDb>>
type DbLike = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

const SURFACES: ReadonlySet<string> = new Set<Surface>(['github', 'linear', 'slack', 'imessage', 'mcp', 'cloud', 'local'])

export interface ExternalIdentity {
  surface: Surface
  externalId: string
}

/**
 * Splits on the first colon only (ids may contain colons). An unknown surface
 * returns null: a wrong identity row is a join key that merges two people.
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
 * `photon` maps to `imessage` because `trust.ts` mints `imessage:<phone>`
 * principals; a `photon` source would not join with the seeded identities.
 */
const CHANNEL_SURFACES: Readonly<Record<string, Surface>> = {
  github: 'github',
  linear: 'linear',
  slack: 'slack',
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

async function findPerson(db: DbLike, tenantId: string, identity: ExternalIdentity) {
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
 * Seeds the maintainer with every principal `trust.ts` knows, on first contact
 * rather than in the migration so a later-added env var is picked up.
 */
async function seedMaintainer(db: Db, tenantId: string): Promise<string | null> {
  const rows = maintainerIdentities()
  const [first] = rows
  if (first === undefined) return null

  return await db.transaction(async (tx) => {
    for (const identity of rows) {
      const existing = await findPerson(tx, tenantId, identity)
      if (existing !== null) {
        await tx.insert(identities).values(
          rows.map(row => ({ ...row, personId: existing, tenantId })),
        ).onConflictDoNothing()
        return existing
      }
    }

    const [person] = await tx
      .insert(people)
      .values({ tenantId, displayName: MAINTAINER_GITHUB_LOGIN, role: 'maintainer' })
      .returning({ id: people.id })
    if (person === undefined) return null

    await tx.insert(identities).values(
      rows.map(row => ({ ...row, personId: person.id, tenantId })),
    ).onConflictDoNothing()

    // A concurrent seed may have won the identity rows; whoever the first
    // identity points at is canonical, and the losing person row must not
    // survive to anchor orphaned memories.
    const winner = await findPerson(tx, tenantId, first)
    if (winner !== null && winner !== person.id) {
      await tx.delete(people).where(eq(people.id, person.id))
      return winner
    }
    return person.id
  })
}

// Runs on every turn through the tool resolver; without the cache the seed
// pass hits the database before the first token of every reply.
const resolved = new Map<string, string | null>()

/** Null means "no person realm", never an error: a missing person costs memory, not the turn. */
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
