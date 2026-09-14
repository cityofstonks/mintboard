import { NextResponse } from 'next/server'
import { COOKIE, adminEnabled, checkPassword, issueToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!adminEnabled()) {
    return NextResponse.json(
      { error: 'No ADMIN_PASSWORD is set, so the admin is switched off. Set one in your environment.' },
      { status: 503 })
  }
  const { password } = await req.json().catch(() => ({ password: '' })) as { password?: string }
  if (!checkPassword(password ?? '')) {
    return NextResponse.json({ error: 'Wrong password.' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, issueToken(), {
    httpOnly: true, sameSite: 'lax', path: '/',
    secure: !!process.env.VERCEL, maxAge: 12 * 3600,
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
