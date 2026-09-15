import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { COOKIE, sessionOf } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Who is signed in, if anyone.
 *
 * The header needs this on every page, so it returns the identity and nothing
 * else — no roles, no data. Cheap enough to ask for constantly and useless to
 * anybody who steals the answer.
 */
export async function GET() {
  const identity = sessionOf((await cookies()).get(COOKIE)?.value)
  return NextResponse.json({ identity }, { headers: { 'cache-control': 'private, no-store' } })
}

/** Sign out: the cookie is the session, so deleting it is the whole job. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
