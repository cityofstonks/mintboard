import { NextResponse } from 'next/server'
import { isOperator, currentProfile, pendingClaims, decideClaim, grantOwnership, collectionById } from '@/lib/accounts'
import { dbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** The operator's queue: claims OpenSea could not settle. */
export async function GET() {
  if (!dbReady()) return NextResponse.json({ error: 'Accounts are not configured here.' }, { status: 503 })
  if (!(await isOperator())) return NextResponse.json({ error: 'Operators only.' }, { status: 403 })
  return NextResponse.json({ claims: await pendingClaims() }, { headers: { 'cache-control': 'private, no-store' } })
}

/** Approve or decline. Approving grants ownership; declining grants nothing. */
export async function PATCH(req: Request) {
  if (!dbReady()) return NextResponse.json({ error: 'Accounts are not configured here.' }, { status: 503 })
  if (!(await isOperator())) return NextResponse.json({ error: 'Operators only.' }, { status: 403 })
  const me = await currentProfile()
  if (!me) return NextResponse.json({ error: 'Sign in with X first.' }, { status: 401 })

  const { id, status, collectionId, profileId } = await req.json().catch(() => ({})) as {
    id?: string; status?: 'approved' | 'declined'; collectionId?: string; profileId?: string
  }
  if (!id || (status !== 'approved' && status !== 'declined')) {
    return NextResponse.json({ error: 'Need a claim and a decision.' }, { status: 400 })
  }

  if (status === 'approved') {
    if (!collectionId || !profileId) return NextResponse.json({ error: 'Missing claim details.' }, { status: 400 })
    // Re-read rather than trust the body: the collection may have been
    // claimed by somebody else while this sat in the queue, and approving
    // then would silently move ownership away from them.
    const c = await collectionById(collectionId)
    if (c?.owner_id && c.owner_id !== profileId) {
      return NextResponse.json({ error: 'That collection was claimed by somebody else while this waited.' }, { status: 409 })
    }
    await grantOwnership(collectionId, profileId, 'operator')
  }
  await decideClaim(id, status, me.id)
  return NextResponse.json({ ok: true })
}
