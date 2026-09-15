import { NextResponse } from 'next/server'
import { mayEdit, onlyEditable, saveCollection, collectionById } from '@/lib/accounts'
import { dbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Edit a collection you own. Ownership is checked against the database. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!dbReady()) return NextResponse.json({ error: 'Accounts are not configured here.' }, { status: 503 })
  const { id } = await ctx.params
  // Checked BEFORE the body is read, so an unauthorised caller never gets as
  // far as having their input parsed.
  if (!(await mayEdit(id))) {
    return NextResponse.json({ error: 'That is not yours to edit.' }, { status: 403 })
  }
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Could not read that.' }, { status: 400 })

  const patch = onlyEditable(body)
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'Nothing in that was editable.' }, { status: 400 })
  }
  try {
    await saveCollection(id, patch)
    return NextResponse.json({ ok: true, collection: await collectionById(id) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.slice(0, 200) }, { status: 500 })
  }
}
