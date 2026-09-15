import { NextResponse } from 'next/server'
import { COOKIE, adminEnabled, checkPassword, issueToken } from '@/lib/auth'
import { callerOf, tooMany } from '@/lib/limit'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!adminEnabled()) {
    return NextResponse.json(
      { error: 'No ADMIN_PASSWORD is set, so the admin is switched off. Set one in your environment.' },
      { status: 503 })
  }
  /*
   * A brake on guessing.
   *
   * This is the only lock on the admin, and the admin now decides what gets
   * posted to a Discord server — approving a collab routes a raffle to
   * @everyone. Unthrottled, a single password is one long loop away from
   * somebody else holding that button. Every other public route here already
   * had a limit; this one, the one that matters most, did not.
   *
   * Ten a minute is generous for a person typing and useless for a script.
   * The counter is per instance and therefore leaky on serverless — an
   * attacker gets a multiple of it — which is still the difference between a
   * loop running unbounded and one that has to work at it.
   */
  const who = callerOf(req)
  if (tooMany(`login:${who}`, 10, 60_000)) {
    return NextResponse.json(
      { error: 'Too many attempts. Wait a minute and try again.' }, { status: 429 })
  }
  const { password } = await req.json().catch(() => ({ password: '' })) as { password?: string }
  if (!checkPassword(password ?? '')) {
    // A wrong password costs a second. Harmless when you mistyped it once,
    // ruinous for anything working through a list.
    await new Promise(r => setTimeout(r, 1000))
    return NextResponse.json({ error: 'Wrong password.' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, issueToken(), {
    httpOnly: true, sameSite: 'lax', path: '/',
    // Secure whenever the request arrived over HTTPS, not only on Vercel — a
    // self-hosted board behind TLS was sending its session cookie unflagged.
    secure: Boolean(process.env.VERCEL) || new URL(req.url).protocol === 'https:',
    maxAge: 12 * 3600,
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
