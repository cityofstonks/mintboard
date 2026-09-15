import { NextResponse } from 'next/server'
import { isOwnerOf, isOperator, currentProfile, managersOf, addManager, removeManager, profileByHandle } from '@/lib/accounts'
import { dbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

const mayManage = async (id: string) => (await isOwnerOf(id)) || (await isOperator())

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!dbReady()) return NextResponse.json({ error: 'Accounts are not configured here.' }, { status: 503 })
  const { id } = await ctx.params
  if (!(await mayManage(id))) return NextResponse.json({ error: 'Owners only.' }, { status: 403 })
  return NextResponse.json({ managers: await managersOf(id) }, { headers: { 'cache-control': 'private, no-store' } })
}

/** Add a manager by X handle. They must have signed in at least once. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!dbReady()) return NextResponse.json({ error: 'Accounts are not configured here.' }, { status: 503 })
  const { id } = await ctx.params
  if (!(await mayManage(id))) return NextResponse.json({ error: 'Owners only.' }, { status: 403 })
  const me = await currentProfile()
  if (!me) return NextResponse.json({ error: 'Sign in with X first.' }, { status: 401 })

  const { handle } = await req.json().catch(() => ({})) as { handle?: string }
  const who = await profileByHandle(String(handle ?? ''))
  if (!who) {
    // Deliberately not created here. A profile is made when somebody signs
    // in and proves the handle is theirs; inventing one would let an owner
    // grant access to an account nobody has demonstrated they control.
    return NextResponse.json(
      { error: 'No Mintboard account for that handle yet — ask them to sign in with X once, then add them.' },
      { status: 404 })
  }
  await addManager(id, who.id, me.id)
  return NextResponse.json({ ok: true, managers: await managersOf(id) })
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!dbReady()) return NextResponse.json({ error: 'Accounts are not configured here.' }, { status: 503 })
  const { id } = await ctx.params
  if (!(await mayManage(id))) return NextResponse.json({ error: 'Owners only.' }, { status: 403 })
  const profileId = new URL(req.url).searchParams.get('profileId') ?? ''
  if (!profileId) return NextResponse.json({ error: 'Which manager?' }, { status: 400 })
  // removeManager only ever deletes role=manager, so an owner cannot be
  // removed by this route — including by themselves, which would orphan the
  // collection with nobody able to edit it.
  await removeManager(id, profileId)
  return NextResponse.json({ ok: true, managers: await managersOf(id) })
}
