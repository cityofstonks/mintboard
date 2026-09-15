import { NextResponse } from 'next/server'
import { currentProfile, collectionById, grantOwnership, fileClaim, createCollection } from '@/lib/accounts'
import { judge, explain, lookupCollection } from '@/lib/ownership'
import { dbReady } from '@/lib/db'
import { callerOf, tooMany } from '@/lib/limit'

export const dynamic = 'force-dynamic'

const slugOf = (s: string) => (s ?? '').trim().toLowerCase()
  .replace(/^https?:\/\/(?:www\.)?opensea\.io\/collection\//, '').replace(/\/.*$/, '')

/**
 * Claim a collection.
 *
 * Verified instantly when OpenSea's twitter_username matches the signed-in
 * handle; otherwise it becomes a request for a person. The route never
 * decides on its own — judge() does, and it is tested.
 */
export async function POST(req: Request) {
  if (!dbReady()) return NextResponse.json({ error: 'Accounts are not configured here.' }, { status: 503 })
  // Each claim costs an OpenSea lookup and can create a row.
  if (tooMany(`claim:${callerOf(req)}`, 10, 10 * 60_000)) {
    return NextResponse.json({ error: 'Too many claims just now. Try again shortly.' }, { status: 429 })
  }
  const me = await currentProfile()
  if (!me) return NextResponse.json({ error: 'Sign in with X first.' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { slug?: string; evidence?: string }
  const slug = slugOf(body.slug ?? '')
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) {
    return NextResponse.json({ error: 'That does not look like an OpenSea collection.' }, { status: 400 })
  }

  const existing = await collectionById(slug)
  if (existing?.owner_id) {
    // Already owned. Never say by whom — that is somebody else's identity.
    return NextResponse.json(
      { error: 'That collection already has an owner. Get in touch if that is wrong.' }, { status: 409 })
  }

  const record = await lookupCollection(slug)
  const verdict = judge(me.x_handle, record)

  if (!existing) {
    // First sight of this collection: create the row from what OpenSea says,
    // unowned. A claim that fails still leaves something for an operator to
    // look at rather than nothing.
    await createCollection({
      id: slug,
      name: record?.name?.slice(0, 120) || slug,
      x_handle: record?.twitter_username?.toLowerCase().replace(/^@/, '') ?? null,
      chain: record?.contracts?.[0]?.chain ?? null,
      contract: record?.contracts?.[0]?.address?.toLowerCase() ?? null,
      opensea_url: `https://opensea.io/collection/${slug}`,
    }).catch(() => { /* a race with another claimant is fine; it exists either way */ })
  }

  if (verdict.grant) {
    await grantOwnership(slug, me.id, 'opensea-x')
    return NextResponse.json({ ok: true, owned: true, message: explain(verdict) })
  }

  await fileClaim(slug, me.id, String(body.evidence ?? '').trim())
  return NextResponse.json({ ok: true, owned: false, queued: true, message: explain(verdict) })
}
