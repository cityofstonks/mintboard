import { createHmac, randomBytes, createHash, timingSafeEqual } from 'node:crypto'

/**
 * Signing in with X or Google, instead of one shared password.
 *
 * WHY THIS REPLACES A PASSWORD
 *
 * The admin decides what gets posted to a Discord server — approving a collab
 * routes a raffle to @everyone. One shared password guarding that has three
 * problems a password cannot fix: everybody who ever had it still has it,
 * revoking it means telling everyone a new one, and the commit an admin
 * action produces cannot say who did it. An allowlist of identities fixes all
 * three, and the identity is checked by X or Google rather than by us.
 *
 * NO DATABASE, STILL. There are no accounts here — nothing is stored about
 * anybody. The provider says who you are, an allowlist says whether that
 * person may edit, and a signed cookie carries the answer. Sign-out is
 * deleting the cookie; access is revoked by editing the allowlist.
 *
 * Everything in this file is a pure function so the parts that must not be
 * wrong can be tested without a network.
 */

export type Provider = 'x' | 'google'

export interface ProviderConfig {
  id: Provider
  label: string
  clientId: string
  clientSecret: string
  authUrl: string
  tokenUrl: string
  scope: string
}

const env = (k: string) => (process.env[k] ?? '').trim()

export function providerConfig(p: Provider): ProviderConfig | null {
  if (p === 'x') {
    const clientId = env('OAUTH_X_CLIENT_ID'), clientSecret = env('OAUTH_X_CLIENT_SECRET')
    if (!clientId || !clientSecret) return null
    return {
      id: 'x', label: 'X', clientId, clientSecret,
      authUrl: 'https://x.com/i/oauth2/authorize',
      tokenUrl: 'https://api.x.com/2/oauth2/token',
      scope: 'users.read tweet.read',
    }
  }
  const clientId = env('OAUTH_GOOGLE_CLIENT_ID'), clientSecret = env('OAUTH_GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) return null
  return {
    id: 'google', label: 'Google', clientId, clientSecret,
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email',
  }
}

export const enabledProviders = (): Provider[] =>
  (['x', 'google'] as Provider[]).filter(p => providerConfig(p) !== null)

const secret = () => env('ADMIN_SECRET') || env('ADMIN_PASSWORD') || ''

/** Constant-time compare of two hex strings. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length || !a) return false
  try { return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex')) } catch { return false }
}

// ── the state parameter ────────────────────────────────────────────────────

/**
 * A signed, expiring state.
 *
 * Without it, anybody can send a victim to our callback carrying THEIR
 * authorisation code and have us sign the victim's browser in as the
 * attacker — or the reverse. The state proves the round trip started here,
 * and the timestamp stops one captured link being reusable forever.
 */
export const STATE_TTL_MS = 10 * 60_000

export function signState(provider: Provider, nonce: string, at: number): string {
  const body = `${provider}.${nonce}.${at}`
  return `${body}.${createHmac('sha256', secret()).update(body).digest('hex')}`
}

export function newState(provider: Provider, at = Date.now()) {
  const nonce = randomBytes(16).toString('hex')
  return { state: signState(provider, nonce, at), nonce }
}

export type StateVerdict =
  | { ok: true; provider: Provider; nonce: string }
  | { ok: false; why: string }

export function readState(state: string, now = Date.now()): StateVerdict {
  if (!secret()) return { ok: false, why: 'no ADMIN_SECRET configured' }
  const parts = (state ?? '').split('.')
  if (parts.length !== 4) return { ok: false, why: 'malformed' }
  const [provider, nonce, atRaw, mac] = parts
  if (provider !== 'x' && provider !== 'google') return { ok: false, why: 'unknown provider' }
  const at = Number(atRaw)
  if (!Number.isFinite(at)) return { ok: false, why: 'no timestamp' }
  if (!sameHex(mac, createHmac('sha256', secret()).update(`${provider}.${nonce}.${at}`).digest('hex'))) {
    return { ok: false, why: 'bad signature' }
  }
  // Checked AFTER the signature, so an unsigned guess cannot learn timing.
  if (now - at > STATE_TTL_MS || at > now + 60_000) return { ok: false, why: 'expired' }
  return { ok: true, provider, nonce }
}

// ── PKCE ───────────────────────────────────────────────────────────────────

/**
 * X requires PKCE. It also protects us: the code returned to our callback is
 * useless without the verifier, which never leaves this server.
 */
export function newVerifier(): string {
  return randomBytes(32).toString('base64url')
}
export function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

// ── the allowlist ──────────────────────────────────────────────────────────

/**
 * Who may edit.
 *
 * ADMIN_ALLOWLIST is a comma-separated list of X handles and Google email
 * addresses — "@fuzz, ops@yourdomain.com". Matching is case-insensitive and
 * ignores a leading @, because the difference between "Fuzz" and "@fuzz" is
 * not a security boundary and treating it as one only locks out the person
 * who typed it slightly differently.
 *
 * AN EMPTY ALLOWLIST ADMITS NOBODY. The tempting default is "no list means
 * everyone", which turns a missing environment variable into an open admin.
 */
export function allows(identity: string, list = env('ADMIN_ALLOWLIST')): boolean {
  const want = norm(identity)
  if (!want) return false
  const entries = list.split(',').map(norm).filter(Boolean)
  if (!entries.length) return false
  return entries.includes(want)
}

const norm = (s: string) => s.trim().toLowerCase().replace(/^@/, '')

/** How an identity is written into the session and the commit trail. */
export const identityOf = (provider: Provider, handleOrEmail: string) =>
  provider === 'x' ? `@${norm(handleOrEmail)}` : norm(handleOrEmail)
