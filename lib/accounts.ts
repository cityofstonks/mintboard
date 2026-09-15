import { cookies } from 'next/headers'
import { COOKIE, sessionOf } from './auth'
import { allows } from './oauth'
import { select, upsert, update, insert, dbReady } from './db'

/**
 * Who is asking, and what they are allowed to touch.
 *
 * Every route that writes anything calls through here first. The rule the
 * whole feature rests on: a signed-in identity is NOT permission. Signing in
 * proves who you are; owning a collection is a separate fact stored in the
 * database, and the two are never conflated.
 */

export interface Profile { id: string; x_handle: string }

export interface Collection {
  id: string; name: string; icon: string | null; chain: string | null
  contract: string | null; x_handle: string | null
  discord_url: string | null; opensea_url: string | null; blurb: string | null
  owner_id: string | null; verified_via: string | null; verified_at: string | null
}

/** The X handle in the current session, or null. */
export async function currentIdentity(): Promise<string | null> {
  const id = sessionOf((await cookies()).get(COOKIE)?.value)
  // 'password' is the legacy shared-password session. It can operate the
  // board but is nobody in particular, so it can never own a collection.
  if (!id || id === 'password') return null
  return id.replace(/^@/, '').toLowerCase()
}

/**
 * The profile row for the current session, created on first sight.
 *
 * Lazily rather than in the OAuth callback, so a database outage cannot stop
 * somebody signing in — they just cannot edit anything until it returns.
 */
export async function currentProfile(): Promise<Profile | null> {
  const handle = await currentIdentity()
  if (!handle || !dbReady()) return null
  const rows = await upsert<Profile[]>('profiles',
    { x_handle: handle, last_seen_at: new Date().toISOString() }, 'x_handle')
  return rows?.[0] ?? null
}

/** Operators can approve claims and edit anything. */
export async function isOperator(): Promise<boolean> {
  const handle = await currentIdentity()
  if (!handle) return false
  // The env allowlist is the source of truth for operators, same as it is for
  // reaching /admin at all — one list, not two that can disagree.
  return allows(`@${handle}`)
}

const q = (s: string) => encodeURIComponent(s)

export const collectionById = async (id: string): Promise<Collection | null> =>
  (await select<Collection[]>(`collections?id=eq.${q(id)}&limit=1`))?.[0] ?? null

export const collectionsOwnedBy = async (profileId: string): Promise<Collection[]> =>
  await select<Collection[]>(`collections?owner_id=eq.${q(profileId)}&order=name.asc`) ?? []

/**
 * Can this session edit this collection?
 *
 * Ownership OR operator. Nothing else — being signed in, having claimed it,
 * or having a matching handle in the row all mean no. A pending claim is a
 * request, and treating a request as permission is the whole bug class this
 * function exists to prevent.
 */
export async function mayEdit(collectionId: string): Promise<boolean> {
  if (await isOperator()) return true
  const me = await currentProfile()
  if (!me) return false
  const c = await collectionById(collectionId)
  return Boolean(c?.owner_id && c.owner_id === me.id)
}

// The write gate lives in editable.ts so it can be tested without this
// file's framework imports. Re-exported so callers keep one import.
import type { Editable } from './editable'
export { onlyEditable, type Editable } from './editable'

export const saveCollection = (id: string, patch: Editable) =>
  update<Collection[]>(`collections?id=eq.${q(id)}`, patch)

export const grantOwnership = (id: string, profileId: string, via: 'opensea-x' | 'operator') =>
  update<Collection[]>(`collections?id=eq.${q(id)}`, {
    owner_id: profileId, verified_via: via, verified_at: new Date().toISOString(),
  })

export const fileClaim = (collectionId: string, profileId: string, evidence: string) =>
  upsert<unknown[]>('ownership_claims',
    { collection_id: collectionId, profile_id: profileId, evidence: evidence.slice(0, 1000), status: 'pending' },
    'collection_id,profile_id')

export const createCollection = (row: Editable & { id: string; name: string }) =>
  insert<Collection[]>('collections', row)
