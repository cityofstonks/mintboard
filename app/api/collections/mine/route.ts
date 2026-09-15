import { NextResponse } from 'next/server'
import { currentProfile, collectionsFor, isOperator } from '@/lib/accounts'
import { dbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** What the signed-in person owns. Empty is a normal answer, not an error. */
export async function GET() {
  if (!dbReady()) return NextResponse.json({ error: 'Accounts are not configured here.' }, { status: 503 })
  const me = await currentProfile()
  if (!me) return NextResponse.json({ error: 'Sign in with X first.' }, { status: 401 })
  return NextResponse.json({
    handle: me.x_handle,
    operator: await isOperator(),
    collections: await collectionsFor(me.id),
  }, { headers: { 'cache-control': 'private, no-store' } })
}
