import { NextResponse } from 'next/server'
import { providerConfig, newState, newVerifier, challengeFor, type Provider } from '@/lib/oauth'
import { FLOW_COOKIE } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** The redirect_uri must match what is registered with the provider exactly. */
export const callbackUrl = (req: Request, p: Provider) =>
  `${new URL(req.url).origin}/api/auth/${p}/callback`

/**
 * Leg one: send them to X or Google.
 *
 * The verifier and nonce go into a short, httpOnly cookie rather than into
 * the URL — the URL is handed to a third party and lands in their logs.
 */
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const p = (await ctx.params).provider as Provider
  if (p !== 'x' && p !== 'google') return NextResponse.json({ error: 'unknown provider' }, { status: 404 })
  const cfg = providerConfig(p)
  if (!cfg) {
    return NextResponse.json(
      { error: `${p} sign-in is not configured on this deployment.` }, { status: 503 })
  }

  const { state, nonce } = newState(p)
  const verifier = newVerifier()

  const url = new URL(cfg.authUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', cfg.clientId)
  url.searchParams.set('redirect_uri', callbackUrl(req, p))
  url.searchParams.set('scope', cfg.scope)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', challengeFor(verifier))
  url.searchParams.set('code_challenge_method', 'S256')
  if (p === 'google') {
    // Ask every time rather than silently reusing a session the browser
    // already has — an admin should know which account they are signing in.
    url.searchParams.set('prompt', 'select_account')
  }

  const res = NextResponse.redirect(url.toString())
  res.cookies.set(FLOW_COOKIE, `${nonce}.${verifier}`, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600,
    secure: new URL(req.url).protocol === 'https:',
  })
  return res
}
