import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { providerConfig, readState, allows, identityOf, type Provider } from '@/lib/oauth'
import { COOKIE, FLOW_COOKIE, issueSession } from '@/lib/auth'
import { callerOf, tooMany } from '@/lib/limit'

export const dynamic = 'force-dynamic'

const deny = (req: Request, why: string) => {
  // The reason goes to our log, never to the browser: somebody probing this
  // should not be told which guard they tripped.
  console.error(`auth callback refused: ${why}`)
  return NextResponse.redirect(new URL('/admin?error=denied', new URL(req.url).origin))
}

/**
 * Leg two: the provider sends them back with a code.
 *
 * Order matters and every step can only ever refuse. Verify the state, redeem
 * the code with the verifier the browser has been holding, ask the provider
 * who this is, and ONLY then consult the allowlist. Nothing about the request
 * is trusted before its signature is checked.
 */
export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const p = (await ctx.params).provider as Provider
  if (p !== 'x' && p !== 'google') return deny(req, 'unknown provider')
  // A callback is cheap to replay; a token exchange is not free for us.
  if (tooMany(`auth:${callerOf(req)}`, 20, 60_000)) return deny(req, 'rate limited')

  const cfg = providerConfig(p)
  if (!cfg) return deny(req, 'provider not configured')

  const url = new URL(req.url)
  const code = url.searchParams.get('code') ?? ''
  const state = url.searchParams.get('state') ?? ''
  if (!code) return deny(req, url.searchParams.get('error') ?? 'no code')

  const verdict = readState(state)
  if (!verdict.ok) return deny(req, `state: ${verdict.why}`)
  if (verdict.provider !== p) return deny(req, 'state is for a different provider')

  const jar = await cookies()
  const flow = jar.get(FLOW_COOKIE)?.value ?? ''
  const [nonce, verifier] = flow.split('.')
  if (!nonce || !verifier) return deny(req, 'no flow cookie')
  // The nonce ties THIS browser to the state we issued. Without it a signed
  // state from one session could be completed in another.
  if (nonce !== verdict.nonce) return deny(req, 'nonce mismatch')

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: `${url.origin}/api/auth/${p}/callback`,
    client_id: cfg.clientId,
    code_verifier: verifier,
  })
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')
  const tokenRes = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      // X wants the secret in the header; Google accepts it either way.
      authorization: `Basic ${basic}`,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null)
  if (!tokenRes?.ok) return deny(req, `token exchange ${tokenRes?.status ?? 'unreachable'}`)
  const tok = await tokenRes.json().catch(() => null) as { access_token?: string; id_token?: string } | null
  if (!tok) return deny(req, 'token response was not JSON')

  let identity = ''
  if (p === 'x') {
    if (!tok.access_token) return deny(req, 'no access token')
    const me = await fetch('https://api.x.com/2/users/me', {
      headers: { authorization: `Bearer ${tok.access_token}` },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null)
    if (!me?.ok) return deny(req, `users/me ${me?.status ?? 'unreachable'}`)
    const j = await me.json().catch(() => null) as { data?: { username?: string } } | null
    if (!j?.data?.username) return deny(req, 'no username')
    identity = identityOf('x', j.data.username)
  } else {
    if (!tok.id_token) return deny(req, 'no id_token')
    // The payload is signed by Google and was just delivered over TLS from
    // their token endpoint, so it is trustworthy here — but email_verified
    // still has to be true, or an unverified address could be claimed.
    const part = tok.id_token.split('.')[1] ?? ''
    let claims: { email?: string; email_verified?: boolean | string } = {}
    try { claims = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) } catch { /* below */ }
    const verified = claims.email_verified === true || claims.email_verified === 'true'
    if (!claims.email || !verified) return deny(req, 'email missing or unverified')
    identity = identityOf('google', claims.email)
  }

  if (!allows(identity)) return deny(req, `not on the allowlist: ${identity}`)

  const res = NextResponse.redirect(new URL('/admin', url.origin))
  res.cookies.set(COOKIE, issueSession(identity), {
    httpOnly: true, sameSite: 'lax', path: '/',
    secure: url.protocol === 'https:', maxAge: 12 * 3600,
  })
  res.cookies.set(FLOW_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  console.log(`admin sign-in: ${identity} via ${p}`)
  return res
}
