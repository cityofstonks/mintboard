import { cookies } from 'next/headers'
import { COOKIE, sessionOf } from './auth'
import { allows } from './oauth'
import { select, upsert, update, insert, rest, dbReady } from './db'

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
  // Owner or manager. Read from collection_managers rather than collections
  // .owner_id so there is ONE answer to "may this person edit", not two that
  // can drift — the owner row is mirrored into that table on grant.
  const rows = await select<{ role: string }[]>(
    `collection_managers?collection_id=eq.${q(collectionId)}&profile_id=eq.${q(me.id)}&limit=1`)
  return Boolean(rows?.length)
}

/** Only an owner may add or remove managers, or hand the community on. */
export async function isOwnerOf(collectionId: string): Promise<boolean> {
  const me = await currentProfile()
  if (!me) return false
  const rows = await select<{ role: string }[]>(
    `collection_managers?collection_id=eq.${q(collectionId)}&profile_id=eq.${q(me.id)}&role=eq.owner&limit=1`)
  return Boolean(rows?.length)
}

export interface ManagerRow { profile_id: string; role: string; added_at: string; profiles: { x_handle: string } | null }

export const managersOf = async (collectionId: string): Promise<ManagerRow[]> =>
  await select<ManagerRow[]>(
    `collection_managers?collection_id=eq.${q(collectionId)}&select=profile_id,role,added_at,profiles(x_handle)&order=role.asc`) ?? []

/** Communities this profile may act for, whether as owner or manager. */
export async function collectionsFor(profileId: string): Promise<Collection[]> {
  const rows = await select<{ collection_id: string }[]>(
    `collection_managers?profile_id=eq.${q(profileId)}&select=collection_id`)
  const ids = (rows ?? []).map(r => r.collection_id)
  if (!ids.length) return []
  return await select<Collection[]>(
    `collections?id=in.(${ids.map(encodeURIComponent).join(',')})&order=name.asc`) ?? []
}

export const addManager = (collectionId: string, profileId: string, by: string) =>
  upsert<unknown[]>('collection_managers',
    { collection_id: collectionId, profile_id: profileId, role: 'manager', added_by: by },
    'collection_id,profile_id')

export const removeManager = (collectionId: string, profileId: string) =>
  rest(`collection_managers?collection_id=eq.${q(collectionId)}&profile_id=eq.${q(profileId)}&role=eq.manager`,
    { method: 'DELETE' })

export const profileByHandle = async (handle: string): Promise<Profile | null> =>
  (await select<Profile[]>(`profiles?x_handle=eq.${q(handle.toLowerCase().replace(/^@/, ''))}&limit=1`))?.[0] ?? null

export interface ClaimRow {
  id: string; collection_id: string; profile_id: string; evidence: string | null
  status: string; created_at: string; profiles: { x_handle: string } | null
  collections: { name: string; x_handle: string | null } | null
}

export const pendingClaims = async (): Promise<ClaimRow[]> =>
  await select<ClaimRow[]>(
    'ownership_claims?status=eq.pending&select=id,collection_id,profile_id,evidence,status,created_at,profiles(x_handle),collections(name,x_handle)&order=created_at.asc') ?? []

export const decideClaim = (id: string, status: 'approved' | 'declined', by: string) =>
  update<ClaimRow[]>(`ownership_claims?id=eq.${q(id)}`,
    { status, decided_at: new Date().toISOString(), decided_by: by })

// The write gate lives in editable.ts so it can be tested without this
// file's framework imports. Re-exported so callers keep one import.
import type { Editable } from './editable'
export { onlyEditable, type Editable } from './editable'

export const saveCollection = (id: string, patch: Editable) =>
  update<Collection[]>(`collections?id=eq.${q(id)}`, patch)

export async function grantOwnership(id: string, profileId: string, via: 'opensea-x' | 'operator') {
  const rows = await update<Collection[]>(`collections?id=eq.${q(id)}`, {
    owner_id: profileId, verified_via: via, verified_at: new Date().toISOString(),
  })
  // Mirror into collection_managers. mayEdit reads that table and nothing
  // else, so an owner who is not in it can be granted a collection and still
  // be unable to touch it.
  await upsert<unknown[]>('collection_managers',
    { collection_id: id, profile_id: profileId, role: 'owner' }, 'collection_id,profile_id')
  return rows
}

export const fileClaim = (collectionId: string, profileId: string, evidence: string) =>
  upsert<unknown[]>('ownership_claims',
    { collection_id: collectionId, profile_id: profileId, evidence: evidence.slice(0, 1000), status: 'pending' },
    'collection_id,profile_id')

export const createCollection = (row: Editable & { id: string; name: string }) =>
  insert<Collection[]>('collections', row)
